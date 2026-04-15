import type { DashboardPayload, DetailCardData, MetricCardData, PredictionCardData, RankingCardData } from './contracts'

export const hero = {
  title: '오늘 KBO 경기의 승리 확률을 한눈에 봅니다.',
  copy:
    '팀 순위, 최근 흐름, 예상 선발, 라인업 생산성, 불펜 피로도, 선수 폼과 Aging Curve를 결합해 경기별 AI 승부예측을 보여주는 MVP 화면입니다.',
  chips: ['데이터 최신화 08:40', '모델 v1.0.0', '경기 5건 예측 완료'],
}

export const predictions: PredictionCardData[] = [
  {
    id: '1',
    gameTime: '18:30',
    awayTeam: 'KT',
    homeTeam: 'LG',
    favoredTeam: 'LG',
    winProbability: 61,
    confidence: '중상',
    topReasons: [
      '[모델 합의] 다수 서브모델이 LG 우세로 수렴',
      '[시즌 성적] LG가 승률과 순위에서 우위',
      '[최근 폼] 최근 10경기 흐름에서 LG가 더 안정적',
      '[홈 어드밴티지] 잠실 홈 경기 가중치 반영',
      '[선발 지표] 예상 선발 최근 3경기 WHIP 개선',
      '[타선 OPS] 상위 타선 최근 7일 OPS 우세',
      '[장타력] 중심 타선 ISOP와 장타 생산성 우위',
      '[볼넷/삼진] 타석 접근 품질이 상대보다 안정적',
      '[불펜 피로도] 최근 3일 불펜 소모량이 더 낮음',
      '[수비 안정성] 실책 및 병살 유도 지표가 상대보다 양호',
    ],
  },
  {
    id: '2',
    gameTime: '18:30',
    awayTeam: 'SSG',
    homeTeam: 'NC',
    favoredTeam: 'SSG',
    winProbability: 57,
    confidence: '중간',
    topReasons: [
      '[모델 합의] 앙상블 기준 SSG가 근소 우세',
      '[최근 폼] 최근 10경기 7승 3패 흐름 반영',
      '[순위/승률] 시즌 누적 성과에서 앞서는 구간 존재',
      '[타선 생산성] 중심 타선 장타 생산성 우위',
      '[OPS] 출루+장타 결합 지표가 상대보다 높음',
      '[도루/주루] 추가 진루 기대값이 더 큼',
      '[불펜 피로도] 최근 불펜 소모량이 상대보다 적음',
      '[볼넷 억제] 투수진 BB/9 제어가 더 안정적',
      '[수비] 실책 억제와 병살 유도 면에서 우세',
    ],
  },
  {
    id: '3',
    gameTime: '18:30',
    awayTeam: '한화',
    homeTeam: '삼성',
    favoredTeam: '한화',
    winProbability: 54,
    confidence: '보통',
    topReasons: [
      '[모델 합의] 접전이지만 한화 쪽으로 소폭 기울음',
      '[선발 지표] 예상 선발 탈삼진 비율 우세',
      '[WHIP] 선발 및 팀 투수진 출루 허용 억제가 더 양호',
      '[최근 폼] 핵심 타자 최근 5경기 타격감 상승',
      '[장타력] 상위 타선 장타 전환율 개선',
      '[불펜 피로도] 상대 불펜 피로 점수 높음',
      '[최근 10경기] 단기 흐름 점수에서 앞섬',
      '[수비] 실점 억제에 기여하는 수비 안정성 반영',
      '[홈/원정 보정] 원정 불리함이 있지만 지표 우세가 상쇄',
    ],
  },
  {
    id: '4',
    gameTime: '18:30',
    awayTeam: '두산',
    homeTeam: 'KIA',
    favoredTeam: 'KIA',
    winProbability: 63,
    confidence: '높음',
    topReasons: [
      '[모델 합의] 다수 모델이 KIA 승리 확률을 높게 평가',
      '[시즌 성적] 누적 승률과 순위 지표 우세',
      '[라인업] 예상 라인업 평균 OPS 우세',
      '[장타력] 중심 타선 HR/ISOP 지표 우수',
      '[투수력] 홈 팀 최근 실점 억제력 개선',
      '[WHIP/ERA] 팀 투수진 핵심 지표가 더 안정적',
      '[좌우 매치업] 예상 선발과 타선 상성 우위',
      '[홈 어드밴티지] 광주 홈 경기 보정 반영',
      '[수비/주루] 세부 실행 지표에서도 근소 우위',
      '[검증] 최근 검증 구간에서도 유사 패턴 승률이 높았음',
    ],
  },
]

export const analyticsMetrics: MetricCardData[] = [
  { label: '오늘 경기 수', value: '5', delta: '+1 vs 어제', tone: 'positive' },
  { label: '평균 예측 신뢰도', value: '67%', delta: '+4.2%', tone: 'positive' },
  { label: '데이터 커버리지', value: '84%', delta: '구종 데이터 일부 부족', tone: 'negative' },
]

export const rankings: RankingCardData[] = [
  { title: '타율 TOP', leader: '박성한', team: 'SSG', value: '.533', note: '최근 7일 출루율도 동반 상승' },
  { title: '홈런 TOP', leader: '오스틴', team: 'LG', value: '3', note: '장타율 우세로 모델 가중치 상승' },
  { title: '탈삼진 TOP', leader: '최원태', team: '삼성', value: '13', note: '선발 matchup feature에 반영' },
]

export const details: DetailCardData[] = [
  {
    title: '라인업 생산성',
    summary: '예상 선발을 기준으로 최근 14일 타격 흐름과 팀 OPS를 합산한 지표입니다.',
    homeTeam: 'LG',
    homeValue: '118',
    awayTeam: 'KT',
    awayValue: '104',
  },
  {
    title: '불펜 피로도',
    summary: '최근 3일 등판 수, 투구 수, 연장전 여부를 반영한 fatigue score입니다.',
    homeTeam: 'NC',
    homeValue: '38',
    awayTeam: 'SSG',
    awayValue: '24',
  },
  {
    title: 'Aging Curve 보정',
    summary: '타선 평균 연령과 최근 3년 성능 변화율을 기반으로 장타력과 contact decline을 보정합니다.',
    homeTeam: 'KIA',
    homeValue: '+6.4',
    awayTeam: '두산',
    awayValue: '-1.8',
  },
]

export function createMockDashboardPayload(date: string): DashboardPayload {
  return {
    date,
    hero,
    predictions,
    analyticsMetrics,
    rankings,
    details,
  }
}
