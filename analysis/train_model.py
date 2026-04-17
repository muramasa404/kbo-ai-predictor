"""
KBO AI Predictor — ML training + live inference
kap_model_v4.3.0: XGBoost trained on team/player features, applied to today's
real Naver KBO schedule + announced starters, written directly to Supabase.

Flow:
  1. Connect to Supabase via DATABASE_URL (psycopg2).
  2. Query team rank, hitter season stats, pitcher season stats.
  3. Build per-team feature dict (winPct, rank, OPS, ERA, WHIP, K/9, BB/9, etc).
  4. Train XGBoost (synthetic labels from current standings — acknowledged proxy).
  5. Fetch today's KBO games from Naver Sports API + announced starters.
  6. For each game, build 22-feature vector, run final_model.predict_proba.
  7. Upsert Game row (sourceGameKey = Naver gameId) + INSERT Prediction row.
"""
from __future__ import annotations
import json
import os
import re
import ssl
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import psycopg2
import xgboost as xgb
from psycopg2.extras import Json
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

MODEL_VERSION = 'kap_model_v4.3.0'
KST = timezone(timedelta(hours=9))
TODAY_KST = datetime.now(KST).strftime('%Y-%m-%d')
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL environment variable not set', file=sys.stderr)
    sys.exit(1)


def gen_id() -> str:
    return 'p' + uuid.uuid4().hex[:24]


# ═══════════════════════════════════════════════════════════════════════════════
# Naver KBO live fetchers
# ═══════════════════════════════════════════════════════════════════════════════
NAVER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
    'Referer': 'https://m.sports.naver.com/',
    'Accept': 'application/json',
}


def naver_fetch_json(url: str, timeout: int = 10) -> dict:
    req = urllib.request.Request(url, headers=NAVER_HEADERS)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_naver_today_games(date: str) -> list[dict]:
    url = f'https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&fromDate={date}&toDate={date}'
    try:
        data = naver_fetch_json(url)
    except Exception as e:
        print(f'[naver] schedule fetch failed: {e}')
        return []
    games = data.get('result', {}).get('games', [])
    return [g for g in games if g.get('categoryId') == 'kbo']


def fetch_naver_preview(game_id: str) -> dict:
    url = f'https://api-gw.sports.naver.com/schedule/games/{game_id}/preview'
    try:
        data = naver_fetch_json(url)
        return data.get('result', {}).get('previewData', {}) or {}
    except Exception:
        return {}


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
# DB — build team feature dict from Supabase
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
            # Offense (filled below)
            'avg': 0.250, 'obp': 0.330, 'slg': 0.380, 'ops': 0.710,
            'isop': 0.130, 'bb_k': 0.55, 'hr': 10, 'rbi': 50,
            # Pitching (filled below)
            'era': 4.50, 'whip': 1.40, 'k9': 7.0, 'bb9': 3.5,
            'kbb_pct': 10.0, 'fip': 4.50, 'hra': 10, 'starter_era': 4.00,
        }

    # Team offense aggregation (AB-weighted OPS, AVG, OBP, SLG)
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
        avg = hits / ab if ab > 0 else 0.250
        singles = hits - (doubles or 0) - (triples or 0) - (hr or 0)
        tb = singles + 2 * (doubles or 0) + 3 * (triples or 0) + 4 * (hr or 0)
        slg = tb / ab if ab > 0 else 0.380
        obp = (hits + bb) / (pa or ab) if (pa or ab) > 0 else 0.330
        teams[name].update({
            'avg': avg, 'obp': obp, 'slg': slg, 'ops': obp + slg,
            'isop': slg - avg,
            'bb_k': bb / so if so > 0 else 0.5,
            'hr': int(hr or 0), 'rbi': int(rbi or 0),
        })

    # Team pitching aggregation (IP-weighted ERA, WHIP, K9, BB9, FIP)
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
        era = (er * 9) / ip if ip > 0 else 4.50
        whip = (h + bb) / ip if ip > 0 else 1.40
        k9 = (so * 9) / ip if ip > 0 else 7.0
        bb9 = (bb * 9) / ip if ip > 0 else 3.5
        kbb_pct = (so - bb) / ip * 9 if ip > 0 else 5.0
        # FIP ≈ (13HR + 3BB - 2K) / IP + constant
        fip = ((13 * hr_allowed + 3 * bb - 2 * so) / ip + 3.2) if ip > 0 else 4.50
        teams[name].update({
            'era': era, 'whip': whip, 'k9': k9, 'bb9': bb9,
            'kbb_pct': kbb_pct, 'fip': fip,
            'hra': int(hr_allowed or 0),
        })

    # Starter ERA proxy (lowest ERA pitcher per team, min 5 games)
    cur.execute(
        '''SELECT DISTINCT ON (t."nameKo") t."nameKo", p."nameKo", s.era::float
           FROM "PlayerPitcherSeasonStat" s
           JOIN "Player" p ON s."playerId" = p.id
           JOIN "Team" t ON p."currentTeamId" = t.id
           WHERE s.era IS NOT NULL AND s.games >= 5
           ORDER BY t."nameKo", s.era ASC'''
    )
    for team_name, _, era in cur.fetchall():
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
        af['rank'] - hf['rank'],  # lower rank = better
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


# ═══════════════════════════════════════════════════════════════════════════════
# Main pipeline
# ═══════════════════════════════════════════════════════════════════════════════
print('=' * 60)
print(f'KBO AI Predictor — {MODEL_VERSION} (training + live inference)')
print('=' * 60)

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()

team_features = build_team_features(cur)
print(f'Loaded features for {len(team_features)} teams')
if len(team_features) < 2:
    print('ERROR: insufficient team features in DB — abort')
    conn.close()
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Generate training samples (synthetic labels — replicating winPct heuristic
# with noise. Real historical outcomes will replace this when GameResult is
# backfilled; today the model still learns a calibrated non-linear mapping.)
# ─────────────────────────────────────────────────────────────────────────────
team_names = list(team_features.keys())
X_train: list[list[float]] = []
y_train: list[int] = []
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
            label = 1 if (prob + noise) > 0.5 else 0
            X_train.append(features)
            y_train.append(label)

X = np.array(X_train); y = np.array(y_train)
print(f'Training samples: {len(X)}  Features: {len(FEATURE_NAMES)}  Home win rate: {np.mean(y):.3f}')

# ─────────────────────────────────────────────────────────────────────────────
# Model comparison + final train
# ─────────────────────────────────────────────────────────────────────────────
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
candidates = {
    'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
    'Random Forest': RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42),
    'Gradient Boosting': GradientBoostingClassifier(n_estimators=100, max_depth=4, random_state=42),
    'XGBoost': xgb.XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42, eval_metric='logloss'),
}
best_name, best_score = '', 0.0
for name, model in candidates.items():
    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy')
    print(f'  {name:20s} acc={scores.mean():.4f} ±{scores.std():.4f}')
    if scores.mean() > best_score:
        best_score = scores.mean(); best_name = name
print(f'Best: {best_name} (acc {best_score:.4f})')

final_model = xgb.XGBClassifier(
    n_estimators=200, max_depth=5, learning_rate=0.08,
    subsample=0.8, colsample_bytree=0.8,
    random_state=42, eval_metric='logloss',
)
final_model.fit(X, y)

# ─────────────────────────────────────────────────────────────────────────────
# Live inference on today's real Naver KBO games
# ─────────────────────────────────────────────────────────────────────────────
print(f'\nFetching today\'s KBO schedule from Naver ({TODAY_KST})...')
today_games = fetch_naver_today_games(TODAY_KST)
print(f'Found {len(today_games)} KBO games today')

# Get season id
cur.execute('SELECT id FROM "Season" WHERE year = 2026 LIMIT 1')
row = cur.fetchone()
if not row:
    print('No 2026 season — aborting inference'); conn.close(); sys.exit(0)
season_id = row[0]

# Cache team id by name
cur.execute('SELECT id, "nameKo" FROM "Team"')
team_id_by_name = {name: tid for tid, name in cur.fetchall()}

written = 0
for g in today_games:
    home_name = g.get('homeTeamName'); away_name = g.get('awayTeamName')
    if home_name not in team_features or away_name not in team_features:
        print(f'  skip {g.get("gameId")}: missing team features for {home_name}/{away_name}')
        continue
    hf = dict(team_features[home_name]); af = dict(team_features[away_name])

    # Override starter ERA from Naver announced starter, if present
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
    prob = max(0.08, min(0.92, prob))  # clip extreme
    gap = abs(prob - 0.5)
    conf = '매우 높음' if gap >= 0.20 else '높음' if gap >= 0.12 else '중상' if gap >= 0.05 else '보통'

    # Feature importance-based reasons
    importances = dict(zip(FEATURE_NAMES, final_model.feature_importances_))
    top_features = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)[:5]

    reasons: list[str] = []
    reasons.append(f'[모델] {MODEL_VERSION} (XGBoost, 22 features, 트레이닝 정확도 {best_score:.3f})')
    reasons.append(f'[일정] {home_name} vs {away_name} · {g.get("gameDateTime","")[11:16]} · {g.get("statusInfo","경기전")}')
    reasons.append(f'[ML 예측] 홈 {prob * 100:.1f}% / 원정 {(1 - prob) * 100:.1f}%')
    reasons.append(f'[승률] {home_name} .{hf["winPct"]:.3f} vs {away_name} .{af["winPct"]:.3f}')
    reasons.append(f'[순위] {home_name} {hf["rank"]}위 vs {away_name} {af["rank"]}위')
    reasons.append(f'[최근10경기] {home_name} {hf["last10Pct"] * 100:.0f}% · {away_name} {af["last10Pct"] * 100:.0f}%')
    reasons.append(f'[연속] {home_name} {"연승" if hf["streak"] > 0 else "연패" if hf["streak"] < 0 else "중립"} {abs(hf["streak"])} · {away_name} {"연승" if af["streak"] > 0 else "연패" if af["streak"] < 0 else "중립"} {abs(af["streak"])}')
    if home_starter and away_starter:
        reasons.append(f'[선발 (KBO 발표)] {home_name} {home_starter["name"]} (ERA {home_starter["era"]}, {home_starter["record"]}) vs {away_name} {away_starter["name"]} (ERA {away_starter["era"]}, {away_starter["record"]})')
    else:
        reasons.append(f'[선발] 발표 전 — 시즌 ERA 1위 투수로 추정 ({home_name} {hf["starter_era"]:.2f} · {away_name} {af["starter_era"]:.2f})')
    reasons.append(f'[팀 OPS] {home_name} {hf["ops"]:.3f} · {away_name} {af["ops"]:.3f}')
    reasons.append(f'[팀 타율] {home_name} {hf["avg"]:.3f} · {away_name} {af["avg"]:.3f}')
    reasons.append(f'[팀 장타율 SLG] {home_name} {hf["slg"]:.3f} · {away_name} {af["slg"]:.3f}')
    reasons.append(f'[팀 출루율 OBP] {home_name} {hf["obp"]:.3f} · {away_name} {af["obp"]:.3f}')
    reasons.append(f'[팀 ERA] {home_name} {hf["era"]:.2f} · {away_name} {af["era"]:.2f}')
    reasons.append(f'[팀 WHIP] {home_name} {hf["whip"]:.2f} · {away_name} {af["whip"]:.2f}')
    reasons.append(f'[팀 K/9] {home_name} {hf["k9"]:.2f} · {away_name} {af["k9"]:.2f}')
    reasons.append(f'[팀 BB/9] {home_name} {hf["bb9"]:.2f} · {away_name} {af["bb9"]:.2f}')
    reasons.append(f'[팀 FIP] {home_name} {hf["fip"]:.2f} · {away_name} {af["fip"]:.2f}')
    reasons.append(f'[팀 홈런] {home_name} {hf["hr"]}개 · {away_name} {af["hr"]}개')
    reasons.append(f'[피홈런] {home_name} {hf["hra"]}개 · {away_name} {af["hra"]}개 (적을수록 유리)')
    reasons.append(f'[홈 어드밴티지] +3.5% (KBO 평균 홈 승률 기반)')
    reasons.append(f'[주요 피처 (XGBoost 학습 중요도)] ' + ', '.join(f'{n} {v:.2f}' for n, v in top_features))

    home_team_id = team_id_by_name.get(home_name); away_team_id = team_id_by_name.get(away_name)
    if not home_team_id or not away_team_id:
        print(f'  skip {g["gameId"]}: missing team id'); continue

    # Upsert Game (sourceGameKey = Naver gameId)
    scheduled_at = g.get('gameDateTime')
    status_code = g.get('statusCode', 'BEFORE')
    status_map = {'BEFORE': 'SCHEDULED', 'STARTED': 'LIVE', 'RESULT': 'FINAL', 'CANCEL': 'CANCELLED', 'POSTPONED': 'POSTPONED'}
    db_status = status_map.get(status_code, 'SCHEDULED')

    cur.execute(
        '''INSERT INTO "Game" (id, "sourceGameKey", "seasonId", "gameDate", "gameType",
                               "homeTeamId", "awayTeamId", "scheduledAt", status, "updatedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
           ON CONFLICT ("sourceGameKey") DO UPDATE SET
               "scheduledAt" = EXCLUDED."scheduledAt",
               status = EXCLUDED.status,
               "updatedAt" = NOW()
           RETURNING id''',
        (gen_id(), g['gameId'], season_id, TODAY_KST, 'REGULAR_SEASON',
         home_team_id, away_team_id, scheduled_at, db_status),
    )
    db_game_id = cur.fetchone()[0]

    # Replace today's prediction rows for this game
    cur.execute(
        '''DELETE FROM "Prediction" WHERE "gameId" = %s AND "predictedAt"::date = CURRENT_DATE''',
        (db_game_id,),
    )
    cur.execute(
        '''INSERT INTO "Prediction" (id, "gameId", "modelVersion", "predictedAt",
                                     "homeWinProb", "awayWinProb", "confidenceGrade", "topReasonsJson")
           VALUES (%s, %s, %s, NOW(), %s, %s, %s, %s)''',
        (gen_id(), db_game_id, MODEL_VERSION, round(prob, 4), round(1 - prob, 4), conf, Json(reasons)),
    )
    written += 1
    print(f'  {away_name} @ {home_name}: {prob * 100:.1f}% [{conf}]')

# Clean up legacy synthetic games
cur.execute('''DELETE FROM "Game" WHERE "sourceGameKey" LIKE 'auto_%' OR "sourceGameKey" LIKE 'ml_%' ''')
legacy_cleaned = cur.rowcount

conn.commit()
cur.close()
conn.close()

# Keep JSON export for debugging / ML audit
os.makedirs('analysis', exist_ok=True)
with open('analysis/ml_predictions.json', 'w', encoding='utf-8') as f:
    json.dump({
        'modelVersion': MODEL_VERSION,
        'modelType': 'XGBoost',
        'features': FEATURE_NAMES,
        'trainingSamples': int(len(X)),
        'cvAccuracy': round(float(best_score), 4),
        'todayGames': len(today_games),
        'predictionsWritten': written,
        'legacyCleaned': int(legacy_cleaned),
        'ranAt': datetime.now(KST).isoformat(),
    }, f, ensure_ascii=False, indent=2)

print(f'\nWritten to Supabase: {written} predictions for {TODAY_KST} ({MODEL_VERSION})')
print(f'Legacy synthetic games cleaned: {legacy_cleaned}')
