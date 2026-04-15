import { prisma } from '../../../../packages/db/src/client'
import { collectExtendedStats, type ExtendedHitterStat, type ExtendedPitcherStat, type RunnerStat } from '../collectors/kbo-extended-stats.collector'

/** Home advantage constant (~3.5% in KBO) */
const HOME_ADV = 0.035

/**
 * KBO AI Predictor — KAP Model v3.0.1
 *
 * 4 Sub-models:
 *   Enhanced Statistical (35%) | ELO Rating (30%) | Pythagorean+Log5 (25%) | Baseline (10%)
 *
 * 22 Features per team:
 *   [Team]     winPct, rank, last10Pct, streak, homePct, awayPct
 *   [Offense]  teamAvg, teamOps, teamIsop, teamGpa, teamHr, teamSb, teamBbK, teamRuns
 *   [Pitching] teamEra, teamWhip, teamKPer9, teamBbPer9, teamHrAllowed, starterEra
 *   [Defense]  teamErrors, teamGdp
 */

interface TeamFeatures {
  teamId: string
  nameKo: string
  // Team strength (6)
  winPct: number; rank: number; last10Pct: number; streak: number; homePct: number; awayPct: number
  // Offense (8)
  teamAvg: number; teamOps: number; teamIsop: number; teamGpa: number
  teamHr: number; teamSb: number; teamBbK: number; teamRuns: number
  // Pitching (6)
  teamEra: number; teamWhip: number; teamKPer9: number; teamBbPer9: number
  teamHrAllowed: number; starterEra: number
  // Defense (2)
  teamErrors: number; teamGdp: number
  // Roster depth
  hitters: ExtendedHitterStat[]; pitchers: ExtendedPitcherStat[]; runners: RunnerStat[]
}

export class PredictionService {
  private readonly modelVersion = 'kap_model_v3.0.1'

  async generatePredictions(seasonId: string): Promise<number> {
    // 1. Collect extended real-time data
    const extended = await collectExtendedStats()

    // 2. Build features from DB ranks + extended stats
    const features = await this.buildTeamFeatures(seasonId, extended.hitters, extended.pitchers, extended.runners)
    if (features.length < 2) return 0

    // 3. Clear old predictions
    await prisma.prediction.deleteMany({})

    // 4. Generate matchups and predict
    const sorted = [...features].sort((a, b) => a.rank - b.rank)
    const matchups = this.createMatchups(sorted)

    let count = 0
    for (const { home, away } of matchups) {
      await this.savePrediction(seasonId, home, away)
      count++
    }
    return count
  }

  private async buildTeamFeatures(
    seasonId: string,
    hitters: ExtendedHitterStat[],
    pitchers: ExtendedPitcherStat[],
    runners: RunnerStat[],
  ): Promise<TeamFeatures[]> {
    const ranks = await prisma.teamRankDaily.findMany({
      where: { seasonId }, orderBy: { rank: 'asc' }, include: { team: true },
    })

    return ranks.map(rank => {
      const teamHitters = hitters.filter(h => h.teamName === rank.team.nameKo)
      const teamPitchers = pitchers.filter(p => p.teamName === rank.team.nameKo)
      const teamRunners = runners.filter(r => r.teamName === rank.team.nameKo)

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

      // Parse last10/streak from rank data
      const l10 = rank.last10 ?? ''
      const l10w = parseInt(l10.match(/(\d+)승/)?.[1] ?? '0')
      const l10l = parseInt(l10.match(/(\d+)패/)?.[1] ?? '0')
      const streakStr = rank.streak ?? ''
      const streakVal = streakStr.includes('승')
        ? parseInt(streakStr.match(/(\d+)/)?.[1] ?? '0')
        : -(parseInt(streakStr.match(/(\d+)/)?.[1] ?? '0'))

      // Offense features
      const teamOBP = avg(teamHitters.map(h => h.pa > 0 ? (h.hits + h.bb + h.hbp) / h.pa : 0))
      const teamSLG = avg(teamHitters.map(h => h.ab > 0 ? (h.hits + h.doubles + 2 * h.triples + 3 * h.hr) / h.ab : 0))

      // Pitching features
      const totalIP = sum(teamPitchers.map(p => p.ip))
      const teamKPer9 = totalIP > 0 ? sum(teamPitchers.map(p => p.so)) / totalIP * 9 : 0
      const teamBbPer9 = totalIP > 0 ? sum(teamPitchers.map(p => p.bb)) / totalIP * 9 : 0

      // Best starter ERA (lowest ERA among starters)
      const starters = teamPitchers.filter(p => (p.gs ?? 0) > 0).sort((a, b) => a.era - b.era)
      const starterEra = starters.length > 0 ? starters[0].era : avg(teamPitchers.map(p => p.era))

      return {
        teamId: rank.teamId, nameKo: rank.team.nameKo,
        winPct: Number(rank.winPct) || 0.5, rank: rank.rank,
        last10Pct: l10w / Math.max(l10w + l10l, 1),
        streak: streakVal,
        homePct: parseRecord(rank.homeRecord ?? ''),
        awayPct: parseRecord(rank.awayRecord ?? ''),
        teamAvg: avg(teamHitters.map(h => h.avg)),
        teamOps: teamOBP + teamSLG,
        teamIsop: avg(teamHitters.map(h => h.isop ?? 0)),
        teamGpa: avg(teamHitters.map(h => h.gpa ?? 0)),
        teamHr: sum(teamHitters.map(h => h.hr)),
        teamSb: sum(teamRunners.map(r => r.sb)),
        teamBbK: avg(teamHitters.map(h => h.bbK ?? 0)),
        teamRuns: sum(teamHitters.map(h => h.rbi)),
        teamEra: avg(teamPitchers.map(p => p.era)),
        teamWhip: avg(teamPitchers.map(p => (p.hitsAllowed + p.bb) / Math.max(p.ip, 1))),
        teamKPer9, teamBbPer9,
        teamHrAllowed: sum(teamPitchers.map(p => p.hrAllowed)),
        starterEra,
        teamErrors: sum(teamHitters.map(h => h.errors)),
        teamGdp: sum(teamHitters.map(h => h.gdp)),
        hitters: teamHitters, pitchers: teamPitchers, runners: teamRunners,
      }
    })
  }

  private createMatchups(sorted: TeamFeatures[]) {
    const half = Math.floor(sorted.length / 2)
    return Array.from({ length: Math.min(half, 5) }, (_, i) => ({
      home: sorted[i], away: sorted[i + half],
    }))
  }

  private async savePrediction(seasonId: string, home: TeamFeatures, away: TeamFeatures) {
    const pB = this.baselineModel(home, away)
    const pE = this.enhancedModel(home, away)
    const pElo = this.eloModel(home, away)
    const pP = this.pythagoreanModel(home, away)

    const ensemble = pE * 0.35 + pElo * 0.30 + pP * 0.25 + pB * 0.10
    const homeProb = clamp(ensemble, 0.05, 0.95)

    const confidence = this.getConfidence(Math.abs(homeProb - 0.5))
    const reasons = this.buildDetailedReasons(home, away, homeProb, { baseline: pB, enhanced: pE, elo: pElo, pythagorean: pP })

    const game = await this.findOrCreateGame(seasonId, home.teamId, away.teamId)
    await prisma.prediction.create({
      data: {
        gameId: game.id, modelVersion: this.modelVersion, predictedAt: new Date(),
        homeWinProb: homeProb, awayWinProb: 1 - homeProb,
        confidenceGrade: confidence, topReasonsJson: reasons,
      },
    })
  }

  // ─── Sub-models ───

  private baselineModel(h: TeamFeatures, a: TeamFeatures): number {
    const hs = h.winPct * 50 + (h.teamAvg / 0.300) * 25 + (4.50 / Math.max(h.teamEra, 0.5)) * 25
    const as_ = a.winPct * 50 + (a.teamAvg / 0.300) * 25 + (4.50 / Math.max(a.teamEra, 0.5)) * 25
    return clamp(hs / (hs + as_) + HOME_ADV, 0.05, 0.95)
  }

  private enhancedModel(h: TeamFeatures, a: TeamFeatures): number {
    const factors = [
      (h.winPct - a.winPct) * 0.20,                          // Season strength
      (h.last10Pct - a.last10Pct) * 0.12,                    // Recent form
      (h.streak - a.streak) * 0.005,                          // Momentum
      (h.teamOps - a.teamOps) * 0.8,                         // Offense OPS
      (h.teamIsop - a.teamIsop) * 0.5,                       // Power (ISOP)
      (h.teamGpa - a.teamGpa) * 0.5,                         // Production (GPA)
      (a.teamEra - h.teamEra) / 8,                           // Pitching ERA
      (a.teamWhip - h.teamWhip) * 0.15,                      // Pitching WHIP
      (h.teamKPer9 - a.teamKPer9) * 0.01,                    // Strikeout ability
      (a.teamBbPer9 - h.teamBbPer9) * 0.01,                  // Walk control
      (h.teamSb - a.teamSb) * 0.003,                         // Speed/baserunning
      (h.teamBbK - a.teamBbK) * 0.1,                         // Plate discipline
      (a.teamErrors - h.teamErrors) * 0.005,                  // Defense
      (a.starterEra - h.starterEra) / 12,                     // Starter quality
      HOME_ADV,                                                  // Home advantage
    ]
    const raw = factors.reduce((s, v) => s + v, 0)
    return clamp(sigmoid(raw * 4), 0.05, 0.95)
  }

  private eloModel(h: TeamFeatures, a: TeamFeatures): number {
    let hElo = 1500 + (h.winPct - 0.5) * 600
    let aElo = 1500 + (a.winPct - 0.5) * 600
    hElo += h.streak * 10 + (h.teamOps - 0.700) * 200 - (h.teamEra - 4.0) * 50 + (h.teamIsop - 0.15) * 100
    aElo += a.streak * 10 + (a.teamOps - 0.700) * 200 - (a.teamEra - 4.0) * 50 + (a.teamIsop - 0.15) * 100
    hElo += 40
    return clamp(1 / (1 + Math.pow(10, (aElo - hElo) / 400)), 0.05, 0.95)
  }

  private pythagoreanModel(h: TeamFeatures, a: TeamFeatures): number {
    const hRs = Math.max(h.teamRuns + h.teamHr * 1.4, 1)
    const aRs = Math.max(a.teamRuns + a.teamHr * 1.4, 1)
    const hRa = Math.max(h.teamEra * Math.max(h.winPct, 0.3) * 3.5, 1)
    const aRa = Math.max(a.teamEra * Math.max(a.winPct, 0.3) * 3.5, 1)
    const e = 1.83
    const hP = Math.pow(hRs, e) / (Math.pow(hRs, e) + Math.pow(hRa, e))
    const aP = Math.pow(aRs, e) / (Math.pow(aRs, e) + Math.pow(aRa, e))
    // Guard NaN before Log5 formula
    if (isNaN(hP) || isNaN(aP)) return 0.5
    const d = hP + aP - 2 * hP * aP
    const prob = d !== 0 ? (hP - hP * aP) / d : 0.5
    return clamp(prob + HOME_ADV, 0.05, 0.95)
  }

  // ─── Detailed reasons (20+ items) ───

  private buildDetailedReasons(
    home: TeamFeatures, away: TeamFeatures, homeProb: number,
    models: { baseline: number; enhanced: number; elo: number; pythagorean: number },
  ): string[] {
    const fav = homeProb >= 0.5 ? home : away
    const dog = homeProb >= 0.5 ? away : home
    const reasons: string[] = []

    // Model consensus
    const agree = [models.enhanced, models.elo, models.pythagorean, models.baseline]
      .filter(p => (homeProb >= 0.5 ? p >= 0.5 : p < 0.5)).length
    reasons.push(`[모델 합의] 4개 서브모델 중 ${agree}개 동일 예측`)

    // Season record
    reasons.push(`[시즌 성적] ${fav.nameKo} 승률 .${fav.winPct.toFixed(3).slice(2)} (${fav.rank}위) vs ${dog.nameKo} .${dog.winPct.toFixed(3).slice(2)} (${dog.rank}위)`)

    // Recent form
    reasons.push(`[최근 폼] ${fav.nameKo} 최근10경기 ${(fav.last10Pct * 100).toFixed(0)}% vs ${dog.nameKo} ${(dog.last10Pct * 100).toFixed(0)}%`)

    // Streak
    if (Math.abs(home.streak) + Math.abs(away.streak) > 0) {
      const desc = (t: TeamFeatures) => t.streak > 0 ? `${t.streak}연승` : t.streak < 0 ? `${Math.abs(t.streak)}연패` : '중립'
      reasons.push(`[모멘텀] ${home.nameKo} ${desc(home)} / ${away.nameKo} ${desc(away)}`)
    }

    // OPS comparison
    reasons.push(`[타선 OPS] ${fav.nameKo} ${fav.teamOps.toFixed(3)} vs ${dog.nameKo} ${dog.teamOps.toFixed(3)}`)

    // Power (ISOP)
    if (Math.abs(home.teamIsop - away.teamIsop) > 0.02) {
      const better = home.teamIsop > away.teamIsop ? home : away
      reasons.push(`[장타력 ISOP] ${better.nameKo} ${better.teamIsop.toFixed(3)} 우세`)
    }

    // GPA
    if (Math.abs(home.teamGpa - away.teamGpa) > 0.01) {
      const better = home.teamGpa > away.teamGpa ? home : away
      reasons.push(`[생산성 GPA] ${better.nameKo} ${better.teamGpa.toFixed(3)} 우위`)
    }

    // HR
    reasons.push(`[홈런] ${home.nameKo} ${home.teamHr}개 vs ${away.nameKo} ${away.teamHr}개`)

    // Stolen bases
    if (home.teamSb + away.teamSb > 0) {
      reasons.push(`[도루] ${home.nameKo} ${home.teamSb}개 vs ${away.nameKo} ${away.teamSb}개`)
    }

    // Plate discipline (BB/K)
    if (Math.abs(home.teamBbK - away.teamBbK) > 0.05) {
      const better = home.teamBbK > away.teamBbK ? home : away
      reasons.push(`[선구안 BB/K] ${better.nameKo} ${better.teamBbK.toFixed(2)} 우세`)
    }

    // Team ERA
    reasons.push(`[팀 ERA] ${fav.nameKo} ${fav.teamEra.toFixed(2)} vs ${dog.nameKo} ${dog.teamEra.toFixed(2)}`)

    // WHIP
    reasons.push(`[팀 WHIP] ${home.nameKo} ${home.teamWhip.toFixed(2)} vs ${away.nameKo} ${away.teamWhip.toFixed(2)}`)

    // K/9
    if (Math.abs(home.teamKPer9 - away.teamKPer9) > 0.5) {
      const better = home.teamKPer9 > away.teamKPer9 ? home : away
      reasons.push(`[탈삼진 K/9] ${better.nameKo} ${better.teamKPer9.toFixed(1)} 우세`)
    }

    // BB/9
    if (Math.abs(home.teamBbPer9 - away.teamBbPer9) > 0.3) {
      const better = home.teamBbPer9 < away.teamBbPer9 ? home : away
      reasons.push(`[제구력 BB/9] ${better.nameKo} ${better.teamBbPer9.toFixed(1)} 우세`)
    }

    // Starter quality
    reasons.push(`[선발 ERA] ${home.nameKo} 에이스 ${home.starterEra.toFixed(2)} vs ${away.nameKo} ${away.starterEra.toFixed(2)}`)

    // HR allowed
    if (Math.abs(home.teamHrAllowed - away.teamHrAllowed) > 1) {
      const better = home.teamHrAllowed < away.teamHrAllowed ? home : away
      reasons.push(`[피홈런] ${better.nameKo} ${better.teamHrAllowed}개 (적음 = 유리)`)
    }

    // Errors
    if (Math.abs(home.teamErrors - away.teamErrors) > 2) {
      const better = home.teamErrors < away.teamErrors ? home : away
      reasons.push(`[수비 실책] ${better.nameKo} ${better.teamErrors}개 (적음 = 안정)`)
    }

    // Home advantage
    if (homeProb >= 0.5) {
      reasons.push(`[홈 어드밴티지] ${home.nameKo} 홈 경기 +3.5% 보정`)
    }

    // Top hitter matchup
    const topH = [...fav.hitters].sort((a, b) => b.avg - a.avg)[0]
    if (topH) {
      reasons.push(`[핵심 타자] ${topH.playerName} AVG ${topH.avg.toFixed(3)} / OPS 기여 상위`)
    }

    // Top pitcher
    const topP = [...fav.pitchers].sort((a, b) => a.era - b.era)[0]
    if (topP) {
      reasons.push(`[핵심 투수] ${topP.playerName} ERA ${topP.era.toFixed(2)} / K ${topP.so}`)
    }

    return reasons
  }

  private getConfidence(diff: number): string {
    if (diff >= 0.25) return '매우 높음'
    if (diff >= 0.15) return '높음'
    if (diff >= 0.08) return '중상'
    if (diff >= 0.03) return '보통'
    return '낮음'
  }

  private async findOrCreateGame(seasonId: string, homeTeamId: string, awayTeamId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const key = `pred_${homeTeamId}_${awayTeamId}_${today.toISOString().slice(0, 10)}`
    return prisma.game.upsert({
      where: { sourceGameKey: key },
      create: {
        sourceGameKey: key, seasonId, gameDate: today, gameType: 'REGULAR_SEASON',
        homeTeamId, awayTeamId,
        scheduledAt: new Date(today.getTime() + 18.5 * 3600000), status: 'SCHEDULED',
      },
      update: {},
    })
  }
}

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)) }
function clamp(v: number, min: number, max: number): number { return Math.min(Math.max(v, min), max) }

function parseRecord(s: string): number {
  if (!s) return 0.5
  const w = parseInt(s.match(/(\d+)승/)?.[1] ?? '0')
  const l = parseInt(s.match(/(\d+)패/)?.[1] ?? '0')
  return w / Math.max(w + l, 1)
}
