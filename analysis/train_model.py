"""
KBO AI Predictor — ML training + live multi-model inference
kap_model_v5.3.0: v5.0 shipped a single W/L classifier trained on real
outcomes. v5.3 runs a second head — an XGBoost regressor on total runs —
so we can express over/under probabilities at common KBO lines (6.5, 7.5,
8.5, 9.5, 10.5 runs). Both heads share the same 22-feature vector + real
historical labels; extras are persisted in Prediction.extrasJson (JSONB
column auto-created on first run).

Planned in v5.3.1+: first-inning lead classifier, per-player prop models
(hits/HR/Ks) once PlayerGameLog backfill from Naver is online.

Limitations documented in description:
  - Features use CURRENT-season stats as a proxy for state-at-game-time.
  - totalRuns regression uses the same (team-strength) vector; run totals
    are noisier than W/L but the model still captures "offensive teams vs
    weak pitching → high totals" plus park-neutral baselines.
"""
from __future__ import annotations
import json
import math
import os
import re
import ssl
import sys
import urllib.request
import traceback
import uuid
from datetime import datetime, timedelta, timezone


def _log_uncaught(exc_type, exc, tb):
    """Last-resort logger — surface the full traceback so `|| echo` wrappers
    in CI never silently swallow failures again."""
    print('\n' + '=' * 70, flush=True)
    print(f'FATAL [{exc_type.__name__}]: {exc}', flush=True)
    print('=' * 70, flush=True)
    traceback.print_exception(exc_type, exc, tb)
    print('=' * 70, flush=True)


sys.excepthook = _log_uncaught

import numpy as np
import psycopg2
import xgboost as xgb
from psycopg2.extras import Json
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, mean_absolute_error
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

MODEL_VERSION = 'kap_model_v5.3.1'
RUN_TOTAL_LINES = [6.5, 7.5, 8.5, 9.5, 10.5]
KST = timezone(timedelta(hours=9))
TODAY_KST = datetime.now(KST).strftime('%Y-%m-%d')
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL environment variable not set', file=sys.stderr)
    sys.exit(1)

HISTORY_YEARS = [2025, 2026]  # seasons to collect results from


def gen_id() -> str:
    return 'p' + uuid.uuid4().hex[:24]


# ═══════════════════════════════════════════════════════════════════════════════
# Naver KBO fetchers
# ═══════════════════════════════════════════════════════════════════════════════
NAVER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
    'Referer': 'https://m.sports.naver.com/',
    'Accept': 'application/json',
}


def naver_fetch_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers=NAVER_HEADERS)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_naver_range(from_date: str, to_date: str) -> list[dict]:
    url = f'https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&fromDate={from_date}&toDate={to_date}'
    try:
        data = naver_fetch_json(url)
    except Exception as e:
        print(f'  [naver] range fetch failed ({from_date}~{to_date}): {e}')
        return []
    games = data.get('result', {}).get('games', [])
    return [g for g in games if g.get('categoryId') == 'kbo']


def fetch_naver_preview(game_id: str) -> dict:
    url = f'https://api-gw.sports.naver.com/schedule/games/{game_id}/preview'
    try:
        data = naver_fetch_json(url, timeout=10)
        return data.get('result', {}).get('previewData', {}) or {}
    except Exception:
        return {}


def fetch_first_inning_score(game_id: str) -> tuple[int | None, int | None]:
    """Return (home_first_inning_runs, away_first_inning_runs) for a completed
    game via Naver textRelay. None if the game didn't finish the 1st inning
    or the API is unavailable."""
    url = f'https://api-gw.sports.naver.com/schedule/games/{game_id}/relay'
    try:
        data = naver_fetch_json(url, timeout=10)
        innings = data.get('result', {}).get('textRelayData', {}).get('inningScore', {}) or {}
        home = innings.get('home', {}) or {}
        away = innings.get('away', {}) or {}

        def _parse(v: object) -> int | None:
            if v is None: return None
            s = str(v).strip()
            if not s or s == '-': return None
            try: return int(s)
            except ValueError: return None

        return _parse(home.get('1')), _parse(away.get('1'))
    except Exception:
        return None, None


def parse_starter(starter: dict | None) -> dict | None:
    if not starter or not starter.get('playerInfo', {}).get('name'):
        return None
    stats = starter.get('currentSeasonStats', {}) or {}
    vs = starter.get('currentSeasonStatsOnOpponents', {}) or {}
    return {
        'name': starter['playerInfo']['name'],
        'era': str(stats.get('era', '-')),
        'whip': str(stats.get('whip', '-')),
        'record': f"{stats.get('w', 0)}승 {stats.get('l', 0)}패",
        'vs_opponent_era': str(vs.get('era')) if vs.get('gameCount') and int(vs.get('gameCount', 0)) > 0 else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# DB helpers
# ═══════════════════════════════════════════════════════════════════════════════
def ensure_season(cur, year: int) -> str:
    cur.execute('SELECT id FROM "Season" WHERE year = %s', (year,))
    row = cur.fetchone()
    if row:
        return row[0]
    sid = gen_id()
    cur.execute(
        '''INSERT INTO "Season" (id, year, "leagueType", "startDate", "endDate", "createdAt", "updatedAt")
           VALUES (%s, %s, 'KBO', %s, %s, NOW(), NOW())
           ON CONFLICT (year) DO UPDATE SET "updatedAt" = NOW()
           RETURNING id''',
        (sid, year, f'{year}-03-01', f'{year}-11-30'),
    )
    return cur.fetchone()[0]


def collect_historical_games(cur, team_id_by_name: dict[str, str]) -> int:
    """Iterate past dates day-by-day for each configured season, upsert Game +
    GameResult for every completed KBO game. Day-granularity queries are
    required: Naver's /schedule/games API returns incomplete or stale data
    when called with wide date ranges, but returns the full slate (~5 games
    with correct RESULT status + scores) when called with fromDate==toDate."""
    import time
    total_written = 0
    total_requests = 0
    today_date = datetime.now(KST).date()

    for year in HISTORY_YEARS:
        season_id = ensure_season(cur, year)
        year_start = datetime(year, 3, 15).date()
        year_end = min(datetime(year, 11, 15).date(), today_date)
        if year_start > today_date:
            continue

        cursor_date = year_start
        year_written = 0
        while cursor_date <= year_end:
            date_str = cursor_date.strftime('%Y-%m-%d')
            games = fetch_naver_range(date_str, date_str)
            total_requests += 1

            for g in games:
                # Keep games with RESULT status OR non-zero score (Naver occasionally
                # leaves historical games as BEFORE but still records the score)
                h_score = g.get('homeTeamScore')
                a_score = g.get('awayTeamScore')
                status = g.get('statusCode')
                has_score = (h_score or 0) + (a_score or 0) > 0
                is_past = cursor_date < today_date
                if not (status == 'RESULT' or (is_past and has_score)):
                    continue
                home_name = g.get('homeTeamName')
                away_name = g.get('awayTeamName')
                if home_name not in team_id_by_name or away_name not in team_id_by_name:
                    continue
                if h_score is None or a_score is None:
                    continue

                scheduled_at = g.get('gameDateTime')
                cur.execute(
                    '''INSERT INTO "Game" (id, "sourceGameKey", "seasonId", "gameDate", "gameType",
                                          "homeTeamId", "awayTeamId", "scheduledAt", status, "updatedAt")
                       VALUES (%s, %s, %s, %s, 'REGULAR_SEASON', %s, %s, %s, 'FINAL', NOW())
                       ON CONFLICT ("sourceGameKey") DO UPDATE SET
                           status = 'FINAL', "updatedAt" = NOW()
                       RETURNING id''',
                    (gen_id(), g['gameId'], season_id, g.get('gameDate'),
                     team_id_by_name[home_name], team_id_by_name[away_name], scheduled_at),
                )
                db_game_id = cur.fetchone()[0]

                is_draw = int(h_score) == int(a_score)
                winner = None if is_draw else (team_id_by_name[home_name] if int(h_score) > int(a_score) else team_id_by_name[away_name])
                loser = None if is_draw else (team_id_by_name[away_name] if int(h_score) > int(a_score) else team_id_by_name[home_name])

                cur.execute(
                    '''INSERT INTO "GameResult" (id, "gameId", "homeScore", "awayScore",
                                                 "winnerTeamId", "loserTeamId", "isDraw", "endedAt", "updatedAt")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT ("gameId") DO UPDATE SET
                           "homeScore" = EXCLUDED."homeScore",
                           "awayScore" = EXCLUDED."awayScore",
                           "winnerTeamId" = EXCLUDED."winnerTeamId",
                           "loserTeamId" = EXCLUDED."loserTeamId",
                           "isDraw" = EXCLUDED."isDraw",
                           "updatedAt" = NOW()''',
                    (gen_id(), db_game_id, int(h_score), int(a_score),
                     winner, loser, is_draw, scheduled_at),
                )
                total_written += 1
                year_written += 1

                # v5.3.1: backfill first-inning score (idempotent — only fetches if NULL)
                cur.execute('SELECT "firstInningHomeScore" FROM "GameResult" WHERE "gameId" = %s', (db_game_id,))
                existing_fi = cur.fetchone()
                if existing_fi is not None and existing_fi[0] is None:
                    fi_home, fi_away = fetch_first_inning_score(g['gameId'])
                    if fi_home is not None and fi_away is not None:
                        cur.execute(
                            '''UPDATE "GameResult" SET "firstInningHomeScore" = %s, "firstInningAwayScore" = %s, "updatedAt" = NOW()
                               WHERE "gameId" = %s''',
                            (fi_home, fi_away, db_game_id),
                        )
                    time.sleep(0.05)

            # Commit every 30 days to avoid losing progress on long runs
            if total_requests % 30 == 0:
                conn.commit()
                print(f'  ...{date_str}: {year_written} games for {year} so far (total {total_written})')
            # Polite throttle — Naver tolerates this fine, avoids bursts
            time.sleep(0.05)
            cursor_date += timedelta(days=1)

        conn.commit()
        print(f'  {year} season complete: {year_written} games')

    return total_written


# ═══════════════════════════════════════════════════════════════════════════════
# Feature engineering (current-season proxy)
# ═══════════════════════════════════════════════════════════════════════════════
def parse_record(s: str | None) -> float:
    if not s:
        return 0.5
    w = int(re.search(r'(\d+)승', s).group(1)) if re.search(r'(\d+)승', s) else 0
    l = int(re.search(r'(\d+)패', s).group(1)) if re.search(r'(\d+)패', s) else 0
    t = w + l
    return w / t if t > 0 else 0.5


def parse_streak(s: str | None) -> int:
    if not s:
        return 0
    m = re.search(r'(\d+)', s)
    if not m:
        return 0
    return int(m.group(1)) if '승' in s else -int(m.group(1))


def parse_last10(s: str | None) -> float:
    if not s:
        return 0.5
    m = re.search(r'(\d+)\s*-\s*(\d+)', s)
    if not m:
        return 0.5
    w = int(m.group(1)); l = int(m.group(2))
    t = w + l
    return w / t if t > 0 else 0.5


def fetch_top_hitters_per_team(cur, n: int = 3) -> dict[str, list[dict]]:
    """Top-N hitters per team by OPS (min 30 AB). Returns {team: [{name,...}]}.
    Used to compute prop probabilities (hit/HR) per game."""
    cur.execute(
        '''SELECT t."nameKo", p."nameKo",
                  COALESCE(s."atBats", 0), COALESCE(s.hits, 0),
                  COALESCE(s."plateAppearances", 0),
                  s.avg, s.ops, COALESCE(s."homeRuns", 0)
           FROM "PlayerHitterSeasonStat" s
           JOIN "Player" p ON s."playerId" = p.id
           JOIN "Team" t ON p."currentTeamId" = t.id
           WHERE s."atBats" >= 30
           ORDER BY t."nameKo", s.ops DESC NULLS LAST'''
    )
    out: dict[str, list[dict]] = {}
    for row in cur.fetchall():
        team = row[0]
        if team not in out:
            out[team] = []
        if len(out[team]) >= n:
            continue
        ab = int(row[2] or 0); pa = int(row[4] or 0)
        avg = float(row[5]) if row[5] is not None else (row[3] / ab if ab > 0 else 0.25)
        out[team].append({
            'name': row[1],
            'ab': ab, 'hits': int(row[3] or 0), 'pa': pa,
            'avg': avg,
            'ops': float(row[6]) if row[6] is not None else 0.70,
            'hr': int(row[7] or 0),
        })
    return out


def compute_hitter_props(h: dict, est_ab: int = 4) -> dict:
    """Binomial prop probabilities for a hitter given expected at-bats."""
    avg = max(0.01, min(0.65, h['avg']))
    hr_rate = (h['hr'] / h['pa']) if h['pa'] > 0 else 0.015
    hr_rate = max(0.001, min(0.10, hr_rate))
    p_no_hit = (1 - avg) ** est_ab
    p_one_hit = est_ab * avg * ((1 - avg) ** (est_ab - 1))
    return {
        'name': h['name'],
        'seasonAvg': round(avg, 3),
        'hit1PlusProb': round(1 - p_no_hit, 4),
        'hit2PlusProb': round(1 - p_no_hit - p_one_hit, 4),
        'hrProb': round(1 - (1 - hr_rate) ** est_ab, 4),
    }


def compute_starter_k_props(starter_info: dict | None) -> dict | None:
    """Poisson K prop for starting pitcher. Uses season K/9 + expected IP (5.5)."""
    if not starter_info:
        return None
    stats = starter_info.get('currentSeasonStats', {}) or {}
    inn_s = stats.get('inn')
    kk = stats.get('kk')
    try:
        inn = float(inn_s) if inn_s is not None else 0.0
        k = int(kk) if kk is not None else 0
    except (TypeError, ValueError):
        return None
    if inn <= 0 or k <= 0:
        return None
    k_per_9 = (k * 9) / inn
    est_ip = 5.5
    rate = max(1.0, min(12.0, k_per_9 * est_ip / 9))

    def poisson_at_least(lam: float, target: int) -> float:
        import math as _m
        p_below = sum(_m.exp(-lam) * (lam ** i) / _m.factorial(i) for i in range(target))
        return max(0.0, min(1.0, 1 - p_below))

    return {
        'name': starter_info.get('playerInfo', {}).get('name', '미정'),
        'seasonKPer9': round(k_per_9, 2),
        'expectedK': round(rate, 2),
        'k5PlusProb': round(poisson_at_least(rate, 5), 4),
        'k7PlusProb': round(poisson_at_least(rate, 7), 4),
    }


def build_team_features(cur) -> dict:
    cur.execute(
        '''SELECT t."nameKo", r.rank, r.wins, r.losses, r.draws,
                  r."winPct"::float, r.last10, r.streak, r."homeRecord", r."awayRecord"
           FROM "TeamRankDaily" r JOIN "Team" t ON r."teamId" = t.id
           ORDER BY r.rank'''
    )
    teams: dict[str, dict] = {}
    for row in cur.fetchall():
        name, rank, w, l, d, win_pct, last10, streak, home_rec, away_rec = row
        teams[name] = {
            'rank': rank or 10,
            'winPct': float(win_pct) if win_pct is not None else 0.5,
            'last10Pct': parse_last10(last10),
            'streak': parse_streak(streak),
            'homePct': parse_record(home_rec),
            'awayPct': parse_record(away_rec),
            'avg': 0.250, 'obp': 0.330, 'slg': 0.380, 'ops': 0.710,
            'isop': 0.130, 'bb_k': 0.55, 'hr': 10, 'rbi': 50,
            'era': 4.50, 'whip': 1.40, 'k9': 7.0, 'bb9': 3.5,
            'kbb_pct': 10.0, 'fip': 4.50, 'hra': 10, 'starter_era': 4.00,
        }

    cur.execute(
        '''SELECT t."nameKo",
                  SUM(s."atBats")::float,
                  SUM(s.hits)::float,
                  SUM(s.walks)::float,
                  SUM(s."strikeOuts")::float,
                  SUM(s."homeRuns")::int,
                  SUM(s."runsBattedIn")::int,
                  SUM(s."doubles")::float,
                  SUM(s."triples")::float,
                  SUM(s."plateAppearances")::float
           FROM "PlayerHitterSeasonStat" s
           JOIN "Player" p ON s."playerId" = p.id
           JOIN "Team" t ON p."currentTeamId" = t.id
           WHERE s."atBats" >= 20
           GROUP BY t."nameKo"'''
    )
    for row in cur.fetchall():
        name, ab, hits, bb, so, hr, rbi, doubles, triples, pa = row
        if name not in teams or not ab or ab <= 0:
            continue
        avg = hits / ab
        singles = hits - (doubles or 0) - (triples or 0) - (hr or 0)
        tb = singles + 2 * (doubles or 0) + 3 * (triples or 0) + 4 * (hr or 0)
        slg = tb / ab
        obp = (hits + bb) / (pa or ab) if (pa or ab) > 0 else 0.330
        teams[name].update({
            'avg': avg, 'obp': obp, 'slg': slg, 'ops': obp + slg,
            'isop': slg - avg,
            'bb_k': bb / so if so > 0 else 0.5,
            'hr': int(hr or 0), 'rbi': int(rbi or 0),
        })

    cur.execute(
        '''SELECT t."nameKo",
                  SUM(s."inningsPitched"::float)::float,
                  SUM(s."earnedRuns")::float,
                  SUM(s."hitsAllowed")::float,
                  SUM(s.walks)::float,
                  SUM(s."strikeOuts")::float,
                  SUM(s."homeRunsAllowed")::float
           FROM "PlayerPitcherSeasonStat" s
           JOIN "Player" p ON s."playerId" = p.id
           JOIN "Team" t ON p."currentTeamId" = t.id
           WHERE s."inningsPitched" > 0
           GROUP BY t."nameKo"'''
    )
    for row in cur.fetchall():
        name, ip, er, h, bb, so, hr_allowed = row
        if name not in teams or not ip or ip <= 0:
            continue
        teams[name].update({
            'era': (er * 9) / ip,
            'whip': (h + bb) / ip,
            'k9': (so * 9) / ip,
            'bb9': (bb * 9) / ip,
            'kbb_pct': (so - bb) / ip * 9,
            'fip': ((13 * hr_allowed + 3 * bb - 2 * so) / ip + 3.2),
            'hra': int(hr_allowed or 0),
        })

    cur.execute(
        '''SELECT DISTINCT ON (t."nameKo") t."nameKo", s.era::float
           FROM "PlayerPitcherSeasonStat" s
           JOIN "Player" p ON s."playerId" = p.id
           JOIN "Team" t ON p."currentTeamId" = t.id
           WHERE s.era IS NOT NULL AND s.games >= 5
           ORDER BY t."nameKo", s.era ASC'''
    )
    for team_name, era in cur.fetchall():
        if team_name in teams:
            teams[team_name]['starter_era'] = float(era)

    return teams


FEATURE_NAMES = [
    'win_pct_diff', 'rank_diff', 'last10_diff', 'streak_diff',
    'venue_pct_diff', 'avg_diff', 'obp_diff', 'slg_diff', 'ops_diff',
    'isop_diff', 'bb_k_diff', 'hr_diff', 'rbi_diff',
    'era_diff', 'whip_diff', 'k9_diff', 'bb9_diff', 'kbb_pct_diff',
    'fip_diff', 'hra_diff', 'starter_era_diff', 'home_indicator',
]


def build_feature_vector(hf: dict, af: dict) -> list[float]:
    return [
        hf['winPct'] - af['winPct'],
        af['rank'] - hf['rank'],
        hf['last10Pct'] - af['last10Pct'],
        hf['streak'] - af['streak'],
        hf['homePct'] - af['awayPct'],
        hf['avg'] - af['avg'],
        hf['obp'] - af['obp'],
        hf['slg'] - af['slg'],
        hf['ops'] - af['ops'],
        hf['isop'] - af['isop'],
        hf['bb_k'] - af['bb_k'],
        hf['hr'] - af['hr'],
        hf['rbi'] - af['rbi'],
        af['era'] - hf['era'],
        af['whip'] - hf['whip'],
        hf['k9'] - af['k9'],
        af['bb9'] - hf['bb9'],
        hf['kbb_pct'] - af['kbb_pct'],
        af['fip'] - hf['fip'],
        af['hra'] - hf['hra'],
        af['starter_era'] - hf['starter_era'],
        1.0,
    ]


def load_real_training_data(cur, team_features: dict):
    """Fetch completed games from DB.
    Returns a dict with:
      X_cls, y_cls   : W/L classification (1 if home won; draws dropped)
      X_reg, y_reg   : run-total regression (draws included)
      X_fi,  y_fi    : 1st-inning lead classification (1 if home led after inning 1)
                       Games without first-inning scores are dropped from this head.
    """
    cur.execute(
        '''SELECT ht."nameKo", at."nameKo",
                  gr."homeScore", gr."awayScore", gr."isDraw",
                  gr."firstInningHomeScore", gr."firstInningAwayScore"
           FROM "Game" g
           JOIN "GameResult" gr ON gr."gameId" = g.id
           JOIN "Team" ht ON ht.id = g."homeTeamId"
           JOIN "Team" at ON at.id = g."awayTeamId"
           WHERE gr."homeScore" IS NOT NULL AND gr."awayScore" IS NOT NULL'''
    )
    rows = cur.fetchall()
    X_cls: list[list[float]] = []; y_cls: list[int] = []
    X_reg: list[list[float]] = []; y_reg: list[float] = []
    X_fi:  list[list[float]] = []; y_fi:  list[int] = []
    for home_name, away_name, hs, as_, is_draw, fi_home, fi_away in rows:
        if home_name not in team_features or away_name not in team_features:
            continue
        features = build_feature_vector(team_features[home_name], team_features[away_name])
        total = int(hs) + int(as_)
        X_reg.append(features); y_reg.append(float(total))
        if not is_draw:
            X_cls.append(features); y_cls.append(1 if int(hs) > int(as_) else 0)
        if fi_home is not None and fi_away is not None and int(fi_home) != int(fi_away):
            X_fi.append(features); y_fi.append(1 if int(fi_home) > int(fi_away) else 0)
    return {
        'X_cls': np.array(X_cls), 'y_cls': np.array(y_cls),
        'X_reg': np.array(X_reg), 'y_reg': np.array(y_reg),
        'X_fi':  np.array(X_fi),  'y_fi':  np.array(y_fi),
    }


def build_synthetic_training_data(team_features: dict) -> tuple[np.ndarray, np.ndarray]:
    """Fallback when real-outcome data is insufficient."""
    team_names = list(team_features.keys())
    X: list[list[float]] = []
    y: list[int] = []
    rng = np.random.default_rng(42)
    for home in team_names:
        for away in team_names:
            if home == away:
                continue
            hf = team_features[home]; af = team_features[away]
            features = build_feature_vector(hf, af)
            home_strength = hf['winPct'] * 0.55 + hf['last10Pct'] * 0.25 + hf['homePct'] * 0.20
            away_strength = af['winPct'] * 0.55 + af['last10Pct'] * 0.25 + af['awayPct'] * 0.20
            prob = home_strength / (home_strength + away_strength) + 0.035
            for _ in range(10):
                noise = rng.normal(0, 0.05)
                X.append(features)
                y.append(1 if (prob + noise) > 0.5 else 0)
    return np.array(X), np.array(y)


# ═══════════════════════════════════════════════════════════════════════════════
# Main pipeline
# ═══════════════════════════════════════════════════════════════════════════════
print('=' * 60)
print(f'KBO AI Predictor — {MODEL_VERSION}')
print('=' * 60)

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()

# v5.3: ensure extrasJson column exists on Prediction (idempotent)
cur.execute('''ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "extrasJson" JSONB''')
conn.commit()

cur.execute('SELECT id, "nameKo" FROM "Team"')
team_id_by_name = {name: tid for tid, name in cur.fetchall()}
print(f'Teams loaded: {len(team_id_by_name)}')

# 1. Collect historical results
print('\n[1/4] Collecting historical KBO results from Naver...')
history_written = collect_historical_games(cur, team_id_by_name)
conn.commit()
print(f'      Historical games upserted: {history_written}')

# 2. Build current team features
team_features = build_team_features(cur)
print(f'\n[2/4] Team features built for {len(team_features)} teams')
if len(team_features) < 2:
    print('ERROR: insufficient team features — abort')
    conn.close()
    sys.exit(1)

# 3. Load training data (real preferred, synthetic fallback)
training = load_real_training_data(cur, team_features)
X_real, y_real       = training['X_cls'], training['y_cls']
X_reg_real, y_reg_real = training['X_reg'], training['y_reg']
X_fi_real,  y_fi_real  = training['X_fi'],  training['y_fi']
print(f'\n[3/4] Real-outcome games available: W/L={len(X_real)}, run-total={len(X_reg_real)}, 1st-inning={len(X_fi_real)}')
label_mode = 'real'
if len(X_real) >= 50 and len(set(y_real.tolist())) == 2:
    X, y = X_real, y_real
    print(f'      Using REAL labels (home win rate: {np.mean(y):.3f}, avg total runs: {np.mean(y_reg_real):.2f})')
else:
    X, y = build_synthetic_training_data(team_features)
    label_mode = 'synthetic'
    print(f'      Insufficient real data — using SYNTHETIC fallback ({len(X)} samples)')

# Hold-out accuracy on real data (honest number)
holdout_acc = None
holdout_brier = None
if label_mode == 'real' and len(X) >= 100:
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    probe = xgb.XGBClassifier(n_estimators=200, max_depth=5, learning_rate=0.08,
                               subsample=0.8, colsample_bytree=0.8, random_state=42, eval_metric='logloss')
    probe.fit(X_tr, y_tr)
    p_te = probe.predict_proba(X_te)[:, 1]
    holdout_acc = float(accuracy_score(y_te, (p_te >= 0.5).astype(int)))
    holdout_brier = float(brier_score_loss(y_te, p_te))
    print(f'      Hold-out test accuracy: {holdout_acc:.4f}   Brier: {holdout_brier:.4f}')

# 4. Model selection + final train
print('\n[4/4] Model selection (5-fold CV on full data)')
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
candidates = {
    'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
    'Random Forest': RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42),
    'Gradient Boosting': GradientBoostingClassifier(n_estimators=100, max_depth=4, random_state=42),
    'XGBoost': xgb.XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42, eval_metric='logloss'),
}
best_name, best_score = '', 0.0
for name, model in candidates.items():
    try:
        scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy')
        print(f'  {name:20s} acc={scores.mean():.4f} ±{scores.std():.4f}')
        if scores.mean() > best_score:
            best_score = scores.mean(); best_name = name
    except Exception as e:
        print(f'  {name:20s} skipped ({e})')
print(f'Best: {best_name} (CV acc {best_score:.4f})')

final_model = xgb.XGBClassifier(
    n_estimators=200, max_depth=5, learning_rate=0.08,
    subsample=0.8, colsample_bytree=0.8,
    random_state=42, eval_metric='logloss',
)
final_model.fit(X, y)

# ─────────────────────────────────────────────────────────────────────────────
# v5.3 addition — run total regressor (XGBoost regression on homeScore+awayScore)
# ─────────────────────────────────────────────────────────────────────────────
run_total_model = None
run_total_std = 3.2  # league-wide residual std (reasonable default for KBO ~8.5 runs/game)
run_total_mae = None
if len(X_reg_real) >= 50:
    rt_model = xgb.XGBRegressor(
        n_estimators=300, max_depth=5, learning_rate=0.06,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, objective='reg:squarederror',
    )
    # Hold-out split for honest MAE/std estimate
    if len(X_reg_real) >= 100:
        Xr_tr, Xr_te, yr_tr, yr_te = train_test_split(X_reg_real, y_reg_real, test_size=0.2, random_state=42)
        rt_model.fit(Xr_tr, yr_tr)
        preds = rt_model.predict(Xr_te)
        run_total_mae = float(mean_absolute_error(yr_te, preds))
        residuals = yr_te - preds
        run_total_std = float(max(np.std(residuals), 2.0))  # floor at 2.0 to avoid overconfident over/under
        print(f'Run-total regressor: MAE={run_total_mae:.2f} runs, residual std={run_total_std:.2f}')
    # Refit on all data for deployment
    rt_model.fit(X_reg_real, y_reg_real)
    run_total_model = rt_model
else:
    print(f'Run-total regressor: insufficient real data ({len(X_reg_real)}) — skipping, will emit neutral over/under')

# ─────────────────────────────────────────────────────────────────────────────
# v5.3.1 addition — 1st-inning lead classifier
#   Training label: 1 if home led after inning 1 (ties dropped).
#   Useful because 1st-inning lead is a specific prop market and it's driven
#   more by starters + top-of-order hitters than by bullpen depth.
# ─────────────────────────────────────────────────────────────────────────────
first_inning_model = None
first_inning_acc = None
if len(X_fi_real) >= 50 and len(set(y_fi_real.tolist())) == 2:
    fi_model = xgb.XGBClassifier(
        n_estimators=180, max_depth=4, learning_rate=0.07,
        subsample=0.85, colsample_bytree=0.8,
        random_state=42, eval_metric='logloss',
    )
    if len(X_fi_real) >= 100:
        Xf_tr, Xf_te, yf_tr, yf_te = train_test_split(X_fi_real, y_fi_real, test_size=0.2, random_state=42, stratify=y_fi_real)
        fi_model.fit(Xf_tr, yf_tr)
        fp = fi_model.predict_proba(Xf_te)[:, 1]
        first_inning_acc = float(accuracy_score(yf_te, (fp >= 0.5).astype(int)))
        print(f'1st-inning lead classifier: hold-out acc={first_inning_acc:.4f}  (home-lead rate in test: {np.mean(yf_te):.3f})')
    fi_model.fit(X_fi_real, y_fi_real)
    first_inning_model = fi_model
else:
    print(f'1st-inning lead classifier: insufficient decisive 1st innings ({len(X_fi_real)}) — skipping')


def normal_cdf(x: float, mean: float, std: float) -> float:
    if std <= 0: return 0.5
    return 0.5 * (1.0 + math.erf((x - mean) / (std * math.sqrt(2))))


def over_under_probs(expected_total: float, std: float) -> list[dict]:
    """For each KBO-realistic run line, compute P(total > line)."""
    out = []
    for line in RUN_TOTAL_LINES:
        p_over = 1.0 - normal_cdf(line, expected_total, std)
        out.append({'line': line, 'overProb': round(p_over, 4), 'underProb': round(1 - p_over, 4)})
    return out

# ═══════════════════════════════════════════════════════════════════════════════
# Live inference on today's real Naver KBO games
# ═══════════════════════════════════════════════════════════════════════════════
print(f'\nFetching today\'s KBO schedule from Naver ({TODAY_KST})...')
top_hitters_by_team = fetch_top_hitters_per_team(cur, n=3)
print(f'Top-3 hitter pool ready for {len(top_hitters_by_team)} teams')

today_games = fetch_naver_range(TODAY_KST, TODAY_KST)
today_games = [g for g in today_games if g.get('statusCode') in ('BEFORE', 'STARTED', 'RESULT', 'DELAY')]
print(f'Found {len(today_games)} KBO games today')

season_id_2026 = ensure_season(cur, 2026)
written = 0
for g in today_games:
    home_name = g.get('homeTeamName'); away_name = g.get('awayTeamName')
    if home_name not in team_features or away_name not in team_features:
        continue
    hf = dict(team_features[home_name]); af = dict(team_features[away_name])

    preview = fetch_naver_preview(g['gameId'])
    home_starter = parse_starter(preview.get('homeStarter'))
    away_starter = parse_starter(preview.get('awayStarter'))
    if home_starter:
        try: hf['starter_era'] = float(home_starter['era'])
        except (TypeError, ValueError): pass
    if away_starter:
        try: af['starter_era'] = float(away_starter['era'])
        except (TypeError, ValueError): pass

    features = build_feature_vector(hf, af)
    prob = float(final_model.predict_proba([features])[0][1])
    prob = max(0.08, min(0.92, prob))
    gap = abs(prob - 0.5)
    conf = '매우 높음' if gap >= 0.20 else '높음' if gap >= 0.12 else '중상' if gap >= 0.05 else '보통'

    importances = dict(zip(FEATURE_NAMES, final_model.feature_importances_))
    top_features = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)[:5]

    label_source = '실제 경기 결과 라벨' if label_mode == 'real' else '합성 라벨 (과거 데이터 부족)'
    acc_text = (f'홀드아웃 정확도 {holdout_acc:.3f} · Brier {holdout_brier:.3f}'
                if holdout_acc is not None else f'5-fold CV {best_score:.3f}')

    reasons: list[str] = []
    reasons.append(f'[모델] {MODEL_VERSION} · XGBoost 22-피처 · {label_source} {len(X)}샘플 · {acc_text}')
    reasons.append(f'[일정] {home_name} vs {away_name} · {g.get("gameDateTime","")[11:16]} · {g.get("statusInfo","경기전")}')
    reasons.append(f'[ML 예측] 홈 {prob * 100:.1f}% / 원정 {(1 - prob) * 100:.1f}%')
    reasons.append(f'[승률] {home_name} .{hf["winPct"]:.3f} vs {away_name} .{af["winPct"]:.3f}')
    reasons.append(f'[순위] {home_name} {hf["rank"]}위 vs {away_name} {af["rank"]}위')
    reasons.append(f'[최근10경기] {home_name} {hf["last10Pct"] * 100:.0f}% · {away_name} {af["last10Pct"] * 100:.0f}%')
    if hf['streak'] != 0 or af['streak'] != 0:
        reasons.append(f'[연속] {home_name} {"연승" if hf["streak"] > 0 else "연패" if hf["streak"] < 0 else "-"} {abs(hf["streak"])} · {away_name} {"연승" if af["streak"] > 0 else "연패" if af["streak"] < 0 else "-"} {abs(af["streak"])}')
    if home_starter and away_starter:
        reasons.append(f'[선발 (KBO 발표)] {home_name} {home_starter["name"]} (ERA {home_starter["era"]}, {home_starter["record"]}) vs {away_name} {away_starter["name"]} (ERA {away_starter["era"]}, {away_starter["record"]})')
    else:
        reasons.append(f'[선발] 발표 전 — 시즌 ERA 1위 투수 추정 ({home_name} {hf["starter_era"]:.2f} · {away_name} {af["starter_era"]:.2f})')
    reasons.append(f'[팀 OPS] {home_name} {hf["ops"]:.3f} · {away_name} {af["ops"]:.3f}')
    reasons.append(f'[팀 타율] {home_name} {hf["avg"]:.3f} · {away_name} {af["avg"]:.3f}')
    reasons.append(f'[팀 장타 SLG] {home_name} {hf["slg"]:.3f} · {away_name} {af["slg"]:.3f}')
    reasons.append(f'[팀 출루 OBP] {home_name} {hf["obp"]:.3f} · {away_name} {af["obp"]:.3f}')
    reasons.append(f'[팀 ERA] {home_name} {hf["era"]:.2f} · {away_name} {af["era"]:.2f}')
    reasons.append(f'[팀 WHIP] {home_name} {hf["whip"]:.2f} · {away_name} {af["whip"]:.2f}')
    reasons.append(f'[팀 K/9] {home_name} {hf["k9"]:.2f} · {away_name} {af["k9"]:.2f}')
    reasons.append(f'[팀 FIP] {home_name} {hf["fip"]:.2f} · {away_name} {af["fip"]:.2f}')
    reasons.append(f'[팀 홈런] {home_name} {hf["hr"]}개 · {away_name} {af["hr"]}개')
    reasons.append(f'[피홈런] {home_name} {hf["hra"]}개 · {away_name} {af["hra"]}개 (적을수록 유리)')
    reasons.append(f'[홈 어드밴티지] +3.5% (KBO 평균 홈 승률)')
    reasons.append(f'[XGBoost 학습 중요도 TOP5] ' + ', '.join(f'{n} {v:.2f}' for n, v in top_features))

    home_team_id = team_id_by_name.get(home_name); away_team_id = team_id_by_name.get(away_name)
    if not home_team_id or not away_team_id:
        continue

    scheduled_at = g.get('gameDateTime')
    status_map = {'BEFORE': 'SCHEDULED', 'STARTED': 'LIVE', 'RESULT': 'FINAL', 'CANCEL': 'CANCELLED', 'POSTPONED': 'POSTPONED'}
    db_status = status_map.get(g.get('statusCode', 'BEFORE'), 'SCHEDULED')

    cur.execute(
        '''INSERT INTO "Game" (id, "sourceGameKey", "seasonId", "gameDate", "gameType",
                               "homeTeamId", "awayTeamId", "scheduledAt", status, "updatedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
           ON CONFLICT ("sourceGameKey") DO UPDATE SET
               "scheduledAt" = EXCLUDED."scheduledAt",
               status = EXCLUDED.status,
               "updatedAt" = NOW()
           RETURNING id''',
        (gen_id(), g['gameId'], season_id_2026, TODAY_KST, 'REGULAR_SEASON',
         home_team_id, away_team_id, scheduled_at, db_status),
    )
    db_game_id = cur.fetchone()[0]

    cur.execute(
        '''DELETE FROM "Prediction" WHERE "gameId" = %s AND "predictedAt"::date = CURRENT_DATE''',
        (db_game_id,),
    )
    # v5.3 — run total over/under
    extras: dict = {}
    if run_total_model is not None:
        expected_total = float(run_total_model.predict([features])[0])
        expected_total = max(3.0, min(18.0, expected_total))  # KBO realistic envelope
        ou_rows = over_under_probs(expected_total, run_total_std)
        extras['runTotal'] = {
            'expected': round(expected_total, 2),
            'stdev': round(run_total_std, 2),
            'lines': ou_rows,
            'mae': run_total_mae,
        }
        # Surface a headline line (the one closest to expected) in reasons
        closest = min(ou_rows, key=lambda r: abs(r['line'] - expected_total))
        reasons.append(
            f'[득점 합계 예측] 예상 {expected_total:.1f}점 · {closest["line"]}점 over {closest["overProb"] * 100:.1f}% / under {closest["underProb"] * 100:.1f}%'
        )
    # v5.3.1 — player props (statistical, not ML-trained — ML heads arrive in v5.4 once PlayerGameLog is collected)
    home_hitter_props = [compute_hitter_props(h) for h in top_hitters_by_team.get(home_name, [])]
    away_hitter_props = [compute_hitter_props(h) for h in top_hitters_by_team.get(away_name, [])]
    home_starter_k = compute_starter_k_props(preview.get('homeStarter'))
    away_starter_k = compute_starter_k_props(preview.get('awayStarter'))
    if home_hitter_props or away_hitter_props or home_starter_k or away_starter_k:
        extras['playerProps'] = {
            'method': 'statistical (Binomial hitter / Poisson starter K, v5.3.1)',
            'assumedAtBats': 4,
            'assumedStarterIP': 5.5,
            'homeHitters': home_hitter_props,
            'awayHitters': away_hitter_props,
            'homeStarterK': home_starter_k,
            'awayStarterK': away_starter_k,
        }

    # v5.3.1 — 1st-inning lead
    if first_inning_model is not None:
        fi_prob = float(first_inning_model.predict_proba([features])[0][1])
        fi_prob = max(0.08, min(0.92, fi_prob))
        extras['firstInningLead'] = {
            'homeLeadProb': round(fi_prob, 4),
            'awayLeadProb': round(1 - fi_prob, 4),
            'holdoutAccuracy': first_inning_acc,
        }
        reasons.append(
            f'[1회 리드 예측] 홈 우세 {fi_prob * 100:.1f}% / 원정 우세 {(1 - fi_prob) * 100:.1f}%'
        )

    extras['confidence'] = conf
    extras['modelFamily'] = {
        'winLossClassifier': 'XGBoost(200, d5, lr0.08)',
        'runTotalRegressor': 'XGBoost(300, d5, lr0.06)' if run_total_model else 'disabled',
        'firstInningClassifier': 'XGBoost(180, d4, lr0.07)' if first_inning_model else 'disabled',
        'labelMode': label_mode,
    }

    cur.execute(
        '''INSERT INTO "Prediction" (id, "gameId", "modelVersion", "predictedAt",
                                     "homeWinProb", "awayWinProb", "confidenceGrade",
                                     "topReasonsJson", "extrasJson")
           VALUES (%s, %s, %s, NOW(), %s, %s, %s, %s, %s)''',
        (gen_id(), db_game_id, MODEL_VERSION, round(prob, 4), round(1 - prob, 4), conf,
         Json(reasons), Json(extras)),
    )
    written += 1
    print(f'  {away_name} @ {home_name}: {prob * 100:.1f}% [{conf}]')

cur.execute('''DELETE FROM "Game" WHERE "sourceGameKey" LIKE 'auto_%' OR "sourceGameKey" LIKE 'ml_%' ''')
legacy_cleaned = cur.rowcount

conn.commit()
cur.close()
conn.close()

os.makedirs('analysis', exist_ok=True)
with open('analysis/ml_predictions.json', 'w', encoding='utf-8') as f:
    json.dump({
        'modelVersion': MODEL_VERSION,
        'labelMode': label_mode,
        'trainingSamples': int(len(X)),
        'realGameLabels': int(len(X_real)),
        'cvAccuracy': round(float(best_score), 4),
        'holdoutAccuracy': holdout_acc,
        'holdoutBrier': holdout_brier,
        'historicalGamesIngested': history_written,
        'todayGames': len(today_games),
        'predictionsWritten': written,
        'legacyCleaned': int(legacy_cleaned),
        'ranAt': datetime.now(KST).isoformat(),
    }, f, ensure_ascii=False, indent=2)

print(f'\nWritten to Supabase: {written} predictions for {TODAY_KST}')
print(f'Label mode: {label_mode} ({len(X_real)} real games, {len(X)} total training samples)')
print(f'Legacy cleaned: {legacy_cleaned}')
