# KBO Feature Builder Spec

## 1. 목적

이 문서는 예측 모델에 들어갈 feature를 단계별로 정의한다.

원칙:

1. baseline feature와 advanced feature를 분리한다.
2. feature는 모두 생성 시점 `snapshotAt`을 가진다.
3. 경기 시작 전 정보만 사용한다.
4. 누락 데이터가 많은 feature는 fallback을 제공한다.

## 2. Feature Layer

## 2.1 Layer A: Baseline Team Features

직접 수집 가능하고 신뢰도가 높은 feature.

- 최근 5경기 승률
- 최근 10경기 승률
- 시즌 승률
- 홈 승률
- 원정 승률
- 팀 순위
- 게임차
- 최근 득점 평균
- 최근 실점 평균

## 2.2 Layer B: Starting Pitcher Features

- 예상 선발투수 최근 3경기 ERA
- 예상 선발투수 최근 3경기 FIP
- 선발투수 휴식일
- 선발투수 최근 투구 수
- 선발투수 시즌 K-BB%
- 선발투수 홈/원정 split
- 선발투수 상대팀 상대 성적

## 2.3 Layer C: Lineup Features

- 예상 라인업 평균 OPS
- 예상 라인업 최근 7일 OPS
- 예상 라인업 좌완 상대 OPS
- 예상 라인업 우완 상대 OPS
- 상위 5타순 생산성
- 핵심 타자 결장 위험도

## 2.4 Layer D: Bullpen/Fatigue Features

- 최근 3일 불펜 투구 수
- 최근 7일 불펜 투구 수
- 최근 3일 홀드/세이브 투수 사용량
- 팀 fatigue score
- 연장전 다음날 여부

## 2.5 Layer E: Matchup/Advanced Features

- lineup vs starter pitch mix advantage
- 핵심 타자 vs starter handedness advantage
- 투수-타자 직접 상성 점수
- 유사 투수군 기준 간접 상성 점수
- aging adjusted lineup score

## 3. Baseline Feature 정의

## 3.1 팀 최근 승률

- `home_recent_5_win_rate`
- `away_recent_5_win_rate`
- `home_recent_10_win_rate`
- `away_recent_10_win_rate`

계산:

- 경기일 이전 완료 경기만 사용

fallback:

- 5경기 미만 시 확보 가능한 표본만 사용

## 3.2 팀 공격력

- `home_team_runs_per_game`
- `away_team_runs_per_game`
- `home_team_ops`
- `away_team_ops`

source:

- 시즌 누적 기록 + 최근 경기 로그

## 3.3 팀 수비/실점력

- `home_team_era`
- `away_team_era`
- `home_recent_runs_allowed`
- `away_recent_runs_allowed`

## 3.4 홈 어드밴티지

- `home_advantage_score`

구성:

- 시즌 홈 승률
- 최근 홈 경기 성과
- 이동 부담 차이

## 4. Starting Pitcher Feature 정의

## 4.1 최근 폼

- `starter_recent_3g_era`
- `starter_recent_3g_fip`
- `starter_recent_3g_whip`
- `starter_recent_3g_pitch_count_avg`

## 4.2 workload

- `starter_rest_days`
- `starter_last_pitch_count`
- `starter_last_14d_pitch_count`

## 4.3 skill

- `starter_season_k_rate`
- `starter_season_bb_rate`
- `starter_season_kbb_rate`
- `starter_season_hr_per_9`

## 4.4 split

- `starter_vs_opponent_team_era`
- `starter_home_split_era`
- `starter_away_split_era`
- `starter_vs_handedness_split`

## 5. Lineup Feature 정의

## 5.1 예상 라인업 강도

- `projected_lineup_avg_ops`
- `projected_lineup_top5_ops`
- `projected_lineup_recent_7d_ops`
- `projected_lineup_recent_14d_ops`

## 5.2 handedness 대응

- `projected_lineup_vs_rhp_ops`
- `projected_lineup_vs_lhp_ops`

## 5.3 availability 반영

- `projected_lineup_availability_penalty`
- `missing_core_hitter_count`

## 6. Bullpen/Fatigue Feature 정의

## 6.1 bullpen usage

- `bullpen_last_3d_pitch_count`
- `bullpen_last_7d_pitch_count`
- `bullpen_last_3d_appearances`

## 6.2 fatigue score

- `bullpen_fatigue_score`
- `team_schedule_fatigue_score`

proxy 구성:

- 최근 등판 수
- 연투 수
- 이동 거리 추정
- 연장전 여부

## 7. Matchup Feature 정의

## 7.1 pitch mix advantage

- `lineup_vs_starter_pitch_mix_advantage`

구성:

- 선발투수 구종 사용률
- 예상 라인업 타자별 구종 대응 성과
- 타순 가중 평균

## 7.2 direct matchup score

- `core_hitters_direct_matchup_score`

구성:

- 직접 상대 OPS
- PA 가중치
- 최근 대결 recency bonus

## 7.3 indirect matchup score

- `lineup_similar_pitcher_cluster_score`

구성:

- 유사 투수군 cluster
- 해당 cluster 상대 성과

## 8. Aging/Trend Feature 정의

## 8.1 lineup aging

- `projected_lineup_avg_age`
- `projected_lineup_aging_score`

## 8.2 starter aging

- `starter_aging_score`
- `starter_velocity_decline_score`

## 8.3 trend

- `core_hitters_trend_score`
- `starter_trend_score`

## 9. Feature 생성 시점

## 9.1 T-1 day nightly

- baseline team features
- season cumulative features
- aging metrics refresh

## 9.2 T-3 hours pregame

- projected starter features
- projected lineup features
- bullpen fatigue score

## 9.3 lineup confirmed refresh

- 확정 라인업 반영 재계산
- 고급 matchup feature 재생성

## 10. 결측 처리 원칙

1. 선발 미확정이면 팀 평균 선발 proxy 사용
2. 라인업 미확정이면 최근 3경기 최빈 라인업 사용
3. pitch data 미확보면 handedness split 기반 축소 feature 사용
4. direct matchup 표본 부족시 indirect matchup 사용

## 11. Feature Importance 예상 순위

초기 예상 중요도:

1. 최근 팀 폼
2. 선발투수 skill + rest
3. 홈/원정 차이
4. bullpen fatigue
5. 예상 라인업 생산성
6. 상성 및 pitch mix advantage
7. aging/trend

## 12. 저장 구조

최종 생성값은 아래에 저장한다.

- `game_prediction_features`
- 상세 계산 근거는 `featurePayload` JSON에 추가 저장

## 13. 모델 버전 운영

- `v1`: baseline team + starter
- `v2`: lineup + bullpen
- `v3`: matchup + pitch mix + aging
