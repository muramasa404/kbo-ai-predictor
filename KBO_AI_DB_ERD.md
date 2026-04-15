# KBO AI DB ERD 초안

## 1. 목표

이 ERD는 KBO 승부예측 서비스에서 필요한 데이터를 아래 4개 레이어로 분리한다.

1. 운영 마스터 데이터
2. 경기/기록 원천 데이터
3. AI 파생 feature 데이터
4. 수집 추적 및 예측 결과 데이터

핵심 원칙은 다음과 같다.

1. 공식 원천 데이터와 AI 파생 데이터를 분리한다.
2. 시즌 누적값과 경기별 로그를 분리한다.
3. 직접 수집값과 추론값을 구분한다.
4. 예측 재현성을 위해 `source snapshot`, `model version`, `feature snapshot time`을 남긴다.

## 2. 도메인 그룹

## 2.1 Master Domain

- `seasons`
- `stadiums`
- `teams`
- `players`
- `player_profiles`

역할:

- 선수/팀/시즌 기준키 제공
- 연령, 포지션, 팀 소속, 프로필 관리

## 2.2 Competition Domain

- `games`
- `game_results`
- `game_broadcasts`
- `team_rank_daily`
- `ranking_snapshots`

역할:

- 경기 일정과 결과
- 일자별 순위
- 메인 화면용 랭킹 카드

## 2.3 Player Performance Domain

- `player_game_logs`
- `player_hitter_season_stats`
- `player_pitcher_season_stats`
- `pitcher_pitch_type_stats`
- `batter_pitch_type_stats`
- `pitcher_batter_matchups`
- `player_availability`

역할:

- 선수별 경기 로그
- 시즌 누적 기록
- 구종/상성/가용성 정보

## 2.4 AI Feature Domain

- `player_form_metrics`
- `player_aging_metrics`
- `game_prediction_features`
- `predictions`

역할:

- 컨디션, fatigue, aging curve, matchup advantage
- 최종 승부예측 입력/출력 저장

## 2.5 DataOps Domain

- `source_snapshots`

역할:

- 어떤 URL에서 어떤 응답을 언제 가져왔는지 추적
- 파싱 실패 시 복구 근거 제공

## 3. 핵심 관계

### 시즌 중심

- `seasons 1:N games`
- `seasons 1:N team_rank_daily`
- `seasons 1:N player_hitter_season_stats`
- `seasons 1:N player_pitcher_season_stats`
- `seasons 1:N pitcher_pitch_type_stats`
- `seasons 1:N batter_pitch_type_stats`

### 팀 중심

- `teams 1:N players`
- `teams 1:N team_rank_daily`
- `teams 1:N games(home_team_id)`
- `teams 1:N games(away_team_id)`
- `teams 1:N player_game_logs`

### 선수 중심

- `players 1:1 player_profiles`
- `players 1:N player_game_logs`
- `players 1:N player_hitter_season_stats`
- `players 1:N player_pitcher_season_stats`
- `players 1:N pitcher_pitch_type_stats`
- `players 1:N batter_pitch_type_stats`
- `players 1:N player_availability`
- `players 1:N player_form_metrics`
- `players 1:N player_aging_metrics`

### 경기 중심

- `games 1:1 game_results`
- `games 1:N game_broadcasts`
- `games 1:N player_game_logs`
- `games 1:N game_prediction_features`
- `games 1:N predictions`

### 상성 중심

- `players(pitcher) 1:N pitcher_batter_matchups`
- `players(batter) 1:N pitcher_batter_matchups`

## 4. 주요 테이블 설명

## 4.1 `players`

역할:

- 선수의 정체성을 대표하는 기준 테이블
- 공식 `source_player_id`를 저장해 동일 이름 충돌을 피함

핵심 컬럼:

- `source_player_id`
- `current_team_id`
- `name_ko`
- `position_primary`
- `throws_hand`, `bats_hand`
- `is_active`

## 4.2 `player_profiles`

역할:

- 연령/피지컬/데뷔정보 등 비교적 변하지 않는 데이터 저장
- aging curve의 기준 데이터

## 4.3 `player_game_logs`

역할:

- 타자/투수 공통 경기 로그 테이블
- 출전 빈도, 휴식일, role 변동, 최근 폼 계산의 기반

핵심 컬럼:

- `role_type`
- `started_flag`
- `batting_order`
- `position_played`
- `rest_days`
- `raw_stats_json`

## 4.4 `pitcher_pitch_type_stats`

역할:

- 투수의 구종별 사용률과 효율 저장
- pitch mix advantage 계산에 사용

핵심 컬럼:

- `pitch_type`
- `usage_rate`
- `avg_velocity`
- `whiff_rate`
- `avg_allowed`
- `slg_allowed`
- `run_value`

## 4.5 `batter_pitch_type_stats`

역할:

- 타자의 구종별 강점/약점 저장
- 특정 선발투수 상대로의 라인업 유불리 계산에 사용

## 4.6 `pitcher_batter_matchups`

역할:

- 선수 대 선수 직접 상대 전적
- 표본이 부족하면 유사 투수군/타자군 feature로 보조

## 4.7 `player_form_metrics`

역할:

- 최근 3경기, 7일, 14일 기준 컨디션 지표 저장
- 실측 컨디션 대신 proxy metric으로 사용

## 4.8 `player_aging_metrics`

역할:

- 연령 효과와 성능 변화율 저장
- 타자 파워 저하, 투수 구속 저하 등을 반영

## 4.9 `game_prediction_features`

역할:

- 경기 예측 직전 생성된 모델 입력값 집합
- 예측 재현성을 위해 snapshot 단위 저장

## 4.10 `predictions`

역할:

- 모델 버전별 예측 결과 저장
- 운영 검증과 회고 분석에 사용

## 5. 텍스트 ERD

```txt
seasons
  |-< games >- game_results
  |-< team_rank_daily
  |-< ranking_snapshots
  |-< player_hitter_season_stats
  |-< player_pitcher_season_stats
  |-< pitcher_pitch_type_stats
  |-< batter_pitch_type_stats

stadiums
  |-< games

teams
  |-< players
  |-< team_rank_daily
  |-< games(home_team_id)
  |-< games(away_team_id)
  |-< player_game_logs

players
  |-1 player_profiles
  |-< player_game_logs
  |-< player_hitter_season_stats
  |-< player_pitcher_season_stats
  |-< pitcher_pitch_type_stats
  |-< batter_pitch_type_stats
  |-< player_availability
  |-< player_form_metrics
  |-< player_aging_metrics
  |-< pitcher_batter_matchups (as pitcher)
  |-< pitcher_batter_matchups (as batter)

games
  |-1 game_results
  |-< game_broadcasts
  |-< player_game_logs
  |-< game_prediction_features
  |-< predictions

source_snapshots
  independent audit/raw layer
```

## 6. 저장 전략

## 6.1 정규화 테이블

- 팀, 선수, 시즌, 경기, 순위, 랭킹, 시즌 기록

## 6.2 반정규화 테이블

- `player_form_metrics`
- `player_aging_metrics`
- `game_prediction_features`

이유:

- 예측 시점마다 빠르게 읽어야 하므로 join 비용을 낮춘다.

## 6.3 JSON 사용 위치

JSON은 아래처럼 제한적으로 쓴다.

- `player_game_logs.raw_stats_json`
- `game_prediction_features.feature_payload`
- `predictions.top_reasons_json`
- `source_snapshots.raw_body`

원칙:

- 자주 조회하는 핵심 값은 컬럼으로 빼고
- 구조 변화가 잦거나 source마다 다른 필드는 JSON으로 둔다.

## 7. 모델 관점의 추천 조인 경로

### 경기 예측 직전

1. `games`
2. `players` + 예상 라인업/선발
3. `player_form_metrics`
4. `player_aging_metrics`
5. `pitcher_pitch_type_stats`
6. `batter_pitch_type_stats`
7. `pitcher_batter_matchups`
8. `team_rank_daily`
9. `player_game_logs`

이 결과를 `game_prediction_features`로 저장한 뒤 모델 inference를 수행한다.

## 8. 구현 우선순위

1. Master + Competition Domain
2. Player Performance Domain의 시즌 기록/경기 로그
3. Feature Domain
4. 구종/상성 세부 테이블
5. 추론 전용 테이블 고도화

## 9. 추천 후속 작업

1. 이 ERD를 기준으로 `Prisma schema` 확정
2. source별 수집 가능 필드 매트릭스 작성
3. 수집기별 upsert key 정의
4. feature builder 배치 설계
