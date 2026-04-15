# KBO 승부예측 서비스 초안

## 1. 목표

KBO 경기 데이터를 수집, 정규화, 적재한 뒤 경기별 승리 확률과 핵심 근거를 제공하는 웹 서비스를 구축한다.

핵심 방향은 다음 3가지다.

1. 필수 외부 데이터 소스를 안정적으로 수집한다.
2. 예측 결과를 단순 승/패가 아니라 설명 가능한 형태로 제공한다.
3. Toss 느낌의 깔끔하고 신뢰감 있는 UI로 모바일 중심 경험을 만든다.

## 2. MVP 범위

MVP에서는 아래 기능까지를 1차 출시 범위로 잡는다.

1. 날짜별 경기 일정/결과 조회
2. 팀/선수 기본 지표 조회
3. 당일 경기 승리 확률 예측
4. 예측 근거 카드 제공
5. 팀/경기/선수 검색
6. 데이터 수집 상태 모니터링

제외 항목은 아래처럼 둔다.

1. 실시간 피치 단위 분석
2. 배당 연동
3. 로그인 기반 커뮤니티 기능
4. 유료 구독 기능

## 3. 필수 데이터 소스와 수집 방식

사용자가 명시한 페이지는 모두 수집 파이프라인에 포함한다.

### 3.1 KBO 기록실

- URL: `https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx?sort=HRA_RT`
- 용도: 타자 기본기록, 시즌/팀/상황별 지표 수집
- 수집 방식:
  - 1순위: KBO 사이트의 내부 비동기 요청 endpoint 탐색 후 API 형태로 수집
  - 2순위: 서버 렌더링 HTML 테이블 크롤링
- 적재 대상:
  - 시즌 타자 기본기록
  - 팀/포지션/상황 필터 기준 raw snapshot
  - 수집 시점 메타데이터

### 3.2 KBO 팀 순위

- URL: `https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx`
- 용도: 일자별 팀 순위, 승률, 게임차, 최근 10경기, 홈/원정 성적
- 수집 방식:
  - HTML 테이블 기준 일별 스냅샷 수집
  - 날짜 파라미터가 내부 요청으로 존재하면 API 우선 사용
- 적재 대상:
  - `team_rank_daily`
  - `team_vs_team_daily`

### 3.3 KBO 선수 순위 TOP5

- URL: `https://www.koreabaseball.com/Record/Ranking/Top5.aspx`
- 용도: 타자/투수 주요 랭킹 카드성 데이터 제공
- 수집 방식:
  - HTML 파싱 기반 카테고리별 TOP5 수집
  - 랭킹 카테고리와 기준값 함께 정규화
- 적재 대상:
  - `ranking_snapshots`
  - 프론트 메인 대시보드용 캐시 테이블

### 3.4 KBO 경기 일정/결과

- URL: `https://www.koreabaseball.com/Schedule/Schedule.aspx`
- 용도: 경기 일정, 결과, 구장, 중계, 상태, 경기 식별자 확보
- 수집 방식:
  - 월 단위 또는 일 단위 리스트/달력 데이터 수집
  - 가능하면 내부 JSON endpoint 탐색 후 API화
  - fallback으로 HTML 파싱
- 적재 대상:
  - `games`
  - `game_results`
  - `game_broadcasts`

### 3.5 Naver KBO 일정/결과

- URL 예시: `https://m.sports.naver.com/kbaseball/schedule/index?category=kbo&date=2026-04-07`
- 용도:
  - KBO 데이터 보완
  - 경기 상태, 기사/중계 링크, 모바일 노출 정보 확보
  - 향후 선발/프리뷰/뉴스 연결 소스로 확장
- 모든 날짜 조회 방식:
  - `date=YYYY-MM-DD`를 하루 단위로 순회 호출
  - 시즌 시작일부터 종료일까지 스케줄러가 자동 수집
  - 과거 시즌 백필 시 날짜 range batch 실행
- 권장 구현:
  - 1순위: Naver 내부 JSON/API endpoint 탐색 후 호출
  - 2순위: 모바일 페이지 HTML 파싱
- 적재 대상:
  - `naver_schedule_snapshots`
  - `game_external_refs`

## 4. 전체 아키텍처 초안

## 4.1 추천 기술스택

- Frontend: `Next.js 15` + `TypeScript` + `Tailwind CSS`
- Backend API/BFF: `Next.js Route Handlers` 또는 `NestJS`
- Background Worker: `Node.js` + `Playwright` + `Cheerio`
- DB: `PostgreSQL`
- Cache: `Upstash Redis` 또는 `Vercel KV`
- ORM: `Prisma`
- Analytics: `GA4`, `Naver Analytics`
- Error Tracking: `Sentry`
- Deploy: `Vercel`

## 4.2 배포 구조

Vercel만으로 프론트와 경량 API는 충분하지만, 장시간 크롤링이나 headless 브라우저 작업은 제약이 생길 수 있다.

따라서 배포는 아래처럼 나누는 구성이 현실적이다.

1. `Vercel`
   - Next.js 프론트
   - BFF API
   - 짧은 캐시 재검증 작업
   - Vercel Cron으로 경량 수집 트리거
2. `Worker Runtime`
   - 실제 크롤링/백필 배치 실행
   - 후보: Railway, Render, Cloud Run, GitHub Actions
3. `PostgreSQL`
   - Neon, Supabase, RDS 중 하나 선택

사용자 요구가 `vercel` 중심이므로, 대외 서비스는 Vercel에 두고 수집 워커만 별도 분리하는 방안을 권장한다.

## 5. 데이터 수집 파이프라인

## 5.1 수집 단계

1. `Collector`
   - KBO/Naver 페이지 또는 내부 endpoint 호출
2. `Raw Storage`
   - 응답 body, 요청 URL, 수집 시각, 상태코드 저장
3. `Parser`
   - HTML/API 응답을 정규화된 구조로 변환
4. `Normalizer`
   - 팀명/선수명/날짜/경기 상태 표준화
5. `Upsert`
   - PostgreSQL에 idempotent 저장
6. `Feature Builder`
   - 예측 모델 입력용 파생 변수 생성
7. `Predictor`
   - 경기별 승률 생성
8. `Serving Cache`
   - 프론트 응답용 요약 데이터 캐시

## 5.2 스케줄링

1. `매일 새벽`
   - 팀 순위, 선수 순위, 기록실 전체 갱신
2. `매 10~30분`
   - 경기 일정/상태/결과 갱신
3. `경기 시작 3시간 전 ~ 경기 종료`
   - 당일 경기 집중 갱신
4. `시즌 백필`
   - 연도/날짜 범위 기준 순차 수집

## 5.3 안정성 장치

1. source별 rate limit
2. retry with backoff
3. HTML selector 버전 관리
4. raw snapshot 저장
5. 파싱 실패시 Sentry 알림
6. 일별 수집 성공률 대시보드 제공

## 6. DB 설계 초안

## 6.1 핵심 테이블

### `teams`

- `id`
- `code`
- `name_ko`
- `name_en`
- `founded_year`
- `stadium_name`

### `players`

- `id`
- `kbo_player_id`
- `team_id`
- `name_ko`
- `name_en`
- `position_type`
- `throws`
- `bats`
- `status`

### `games`

- `id`
- `source_game_key`
- `game_date`
- `season_year`
- `game_type`
- `home_team_id`
- `away_team_id`
- `stadium`
- `scheduled_at`
- `status`
- `double_header_flag`

### `game_results`

- `game_id`
- `home_score`
- `away_score`
- `winner_team_id`
- `loser_team_id`
- `is_draw`
- `ended_at`
- `summary_text`

### `team_rank_daily`

- `id`
- `rank_date`
- `team_id`
- `rank`
- `games`
- `wins`
- `losses`
- `draws`
- `win_pct`
- `games_back`
- `last_10`
- `streak`
- `home_record`
- `away_record`

### `player_hitter_stats_season`

- `id`
- `season_year`
- `player_id`
- `team_id`
- `games`
- `pa`
- `ab`
- `hits`
- `avg`
- `hr`
- `rbi`
- `obp`
- `slg`
- `ops`

### `player_pitcher_stats_season`

- `id`
- `season_year`
- `player_id`
- `team_id`
- `era`
- `ip`
- `so`
- `bb`
- `whip`
- `wins`
- `losses`
- `saves`
- `holds`

### `ranking_snapshots`

- `id`
- `snapshot_date`
- `category`
- `player_id`
- `team_id`
- `rank`
- `value`
- `group_type`

### `source_snapshots`

- `id`
- `source_name`
- `request_url`
- `request_date_key`
- `response_status`
- `content_hash`
- `raw_body`
- `collected_at`

### `model_features`

- `game_id`
- `snapshot_at`
- `home_recent_win_rate`
- `away_recent_win_rate`
- `home_team_ops`
- `away_team_ops`
- `home_team_era`
- `away_team_era`
- `home_rest_days`
- `away_rest_days`
- `home_rank`
- `away_rank`
- `home_advantage_score`

### `predictions`

- `id`
- `game_id`
- `model_version`
- `predicted_at`
- `home_win_prob`
- `away_win_prob`
- `confidence_grade`
- `top_reasons_json`

## 6.2 인덱스 전략

1. `games(game_date, status)`
2. `team_rank_daily(rank_date, team_id)` unique
3. `player_hitter_stats_season(season_year, player_id)` unique
4. `source_snapshots(source_name, request_date_key, content_hash)`
5. `predictions(game_id, model_version, predicted_at desc)`

## 7. 예측 모델 초안

## 7.1 1차 모델 전략

초기에는 복잡한 딥러닝보다 운영 안정성과 설명력을 우선한다.

1. Baseline: `Elo + Home Advantage`
2. Main Model: `LightGBM` 또는 `XGBoost`
3. Calibration: `Platt Scaling` 또는 `Isotonic Regression`

## 7.2 주요 feature

1. 최근 5경기, 10경기 승률
2. 홈/원정 승률
3. 팀 순위 및 게임차
4. 팀 타격 지표
   - AVG, OBP, SLG, OPS, HR, 득점
5. 팀 투수 지표
   - ERA, WHIP, SO/BB, 불펜 사용량
6. 상대전적
7. 휴식일 수
8. 시즌 초반/중반/후반 시점 변수
9. 최근 랭킹 급등락 변수

## 7.3 예측 결과 노출 방식

사용자에게는 숫자만 보여주지 않고 이유를 같이 제공한다.

예시:

- `KT 승리 확률 62%`
- `최근 10경기 7승 3패`
- `상대 선발 대비 팀 OPS 우위`
- `원정이지만 불펜 소모가 적음`

## 8. 백엔드 설계 초안

## 8.1 API 구성

### Public API

- `GET /api/games?date=2026-04-07`
- `GET /api/games/:id`
- `GET /api/predictions?date=2026-04-07`
- `GET /api/teams`
- `GET /api/teams/:id`
- `GET /api/players/:id`
- `GET /api/rankings/top5`
- `GET /api/team-rank/daily?date=2026-04-07`

### Admin API

- `POST /api/admin/collect/kbo/schedule`
- `POST /api/admin/collect/kbo/rankings`
- `POST /api/admin/collect/naver/schedule`
- `POST /api/admin/backfill?from=2024-03-01&to=2024-10-01`
- `POST /api/admin/predict/rebuild`

## 8.2 내부 모듈 구조

1. `apps/web`
   - Next.js 앱
2. `apps/worker`
   - 크롤러/배치
3. `packages/db`
   - Prisma schema, repository
4. `packages/core`
   - 공통 타입, 팀명 정규화, 날짜 유틸
5. `packages/model`
   - feature builder, inference

## 8.3 크롤링 모듈 구조

1. `collectors/kbo-hitter-basic.collector.ts`
2. `collectors/kbo-team-rank.collector.ts`
3. `collectors/kbo-top5.collector.ts`
4. `collectors/kbo-schedule.collector.ts`
5. `collectors/naver-schedule.collector.ts`
6. `parsers/*`
7. `normalizers/*`

## 9. 프론트엔드 초안

## 9.1 디자인 방향

`TossUI_copy.txt` 기준으로 내용이 아니라 디자인 인상을 가져간다.

핵심 키워드:

1. 밝은 배경과 높은 가독성
2. 큰 숫자 중심 정보 계층
3. 넓은 여백
4. 둥근 카드
5. 얕은 그림자
6. 짧고 명확한 카피
7. 모바일 우선 스크롤 경험

## 9.2 UI 스타일 가이드

- 배경: `#F6F7F9`
- 기본 카드: `#FFFFFF`
- 본문 텍스트: `#191F28`
- 보조 텍스트: `#8B95A1`
- 강조 블루: `#3182F6`
- 성공/상승: `#0AAE5C`
- 위험/하락: `#F04452`
- radius: `20px ~ 28px`
- shadow: 매우 약하게

## 9.3 폰트

사용자 요구에 따라 Google Font API 사용.

추천 조합:

1. `Inter` 또는 `Pretendard 대체 느낌의 Sans`
2. 숫자 가독성을 위해 `tabular-nums` 적용

Google Font API 예시:

- `Inter`
- `Noto Sans KR`

## 9.4 주요 화면

### 홈

- 오늘 경기 리스트
- 경기별 승률 카드
- 핵심 랭킹 TOP5
- 데이터 최신 수집 시각

### 경기 상세

- 홈/원정 승률 비교
- 최근 흐름
- 팀 타격/투수 비교
- 예측 근거 카드
- 시즌 상대전적

### 팀 상세

- 팀 순위
- 최근 10경기
- 홈/원정 분리 성적
- 팀 핵심 선수

### 선수 상세

- 시즌 기록
- 랭킹 노출 여부
- 최근 상승세 뱃지

### 데이터 현황 페이지

- 수집 성공률
- 마지막 수집 시간
- 장애 이력

## 9.5 UX 패턴

1. 첫 화면에서 바로 오늘 경기 승률을 본다.
2. 카드를 누르면 상세 근거로 들어간다.
3. 모든 숫자는 한눈에 비교 가능하게 정렬한다.
4. 로딩 상태에서도 스켈레톤 카드 유지
5. 예측 실패보다 데이터 부족을 명확히 표시

## 10. 분석/관측 설계

## 10.1 GA4

이벤트 예시:

- `view_home`
- `view_game_detail`
- `view_prediction`
- `click_team_card`
- `search_team`
- `search_player`
- `change_date`

추가로 아래 funnel을 본다.

1. 홈 방문
2. 경기 상세 진입
3. 예측 근거 확인
4. 재방문률

## 10.2 Naver Analytics

- 국내 유입 채널 확인
- 검색/블로그/커뮤니티 유입 성과 분석

## 10.3 Sentry

- 프론트 렌더링 오류
- API 실패
- 크롤러 파싱 실패
- DB upsert 실패
- 배치 시간 초과

## 11. 운영 시나리오

## 11.1 일일 운영 플로우

1. 새벽에 시즌/일간 데이터 수집
2. 오전에 feature 생성
3. 경기 시작 전 예측 생성
4. 경기 종료 후 결과 확정
5. 실제 결과와 예측 비교 리포트 생성

## 11.2 관리자 대시보드 최소 기능

1. source별 수집 성공 여부
2. 파싱 실패 건수
3. 당일 예측 생성 건수
4. 최근 모델 정확도

## 12. 추천 구현 순서

1. PostgreSQL + Prisma 스키마 구성
2. KBO 일정/결과 수집기 구현
3. KBO 팀 순위 수집기 구현
4. KBO 기록실/선수순위 수집기 구현
5. Naver 날짜 순회 수집기 구현
6. 정규화/업서트 계층 구현
7. 예측 baseline 모델 구현
8. Next.js 메인 화면 구현
9. 경기 상세/팀 상세 구현
10. Analytics/Sentry/Vercel 배포

## 13. MVP 폴더 구조 예시

```txt
apps/
  web/
  worker/
packages/
  db/
  core/
  model/
docs/
```

## 14. 현실적인 주의사항

1. KBO/Naver 페이지 구조는 변경될 수 있으므로 raw snapshot 저장이 필수다.
2. 동일 선수 이름 중복 가능성이 있어 `source player id`를 우선 키로 써야 한다.
3. Vercel 함수는 긴 크롤링 작업에 약하므로 백필과 headless 작업은 워커 분리가 안전하다.
4. 시즌 초반 데이터가 적을 때는 예측 신뢰도가 낮아지므로 `confidence_grade`를 함께 노출해야 한다.
5. 예측 서비스는 승률 제공과 데이터 분석을 중심으로 하고, 도박성 표현은 피하는 것이 안전하다.

## 15. 바로 다음 단계 제안

가장 좋은 다음 단계는 아래 순서다.

1. `DB 스키마 + 수집기 골격`부터 만든다.
2. 필수 5개 소스 중 `KBO 일정/결과`와 `Naver 날짜 순회 수집기`를 먼저 붙인다.
3. 그 다음 `오늘 경기 승률 카드`만 먼저 보여주는 MVP 화면을 만든다.

## 16. AI 승부예측용 초상세 데이터 확장안

사용자 요구 기준에서 예측 모델은 단순 팀 단위가 아니라 선수 단위, 구종 단위, 상성 단위, 시계열 컨디션 단위까지 고려해야 한다.

즉, 목표 데이터 수준은 아래와 같다.

1. 팀 정보
2. 선수 공식 프로필 정보
3. 시즌 누적 기록
4. 경기별 기록
5. 타석/이닝/투구 단위 기록
6. 구종별 성과
7. 투수-타자 상성
8. 출전 빈도와 휴식일
9. 나이와 aging curve
10. 컨디션 proxy

## 17. 선수 데이터 레이어 설계

## 17.1 선수 마스터 정보

필수 컬럼:

- `player_id`
- `kbo_player_id`
- `name_ko`
- `name_en`
- `birth_date`
- `age`
- `debut_year`
- `service_years`
- `team_id`
- `position_primary`
- `position_secondary`
- `throws`
- `bats`
- `height_cm`
- `weight_kg`
- `draft_info`
- `salary`
- `injury_status`
- `registration_status`

활용 목적:

- aging curve 계산
- 커리어 단계 분류
- 포지션별 기대 성능 보정
- 주전/백업/불펜 역할 분류

## 17.2 선수 시즌 기록

타자:

- `AVG`, `OBP`, `SLG`, `OPS`
- `PA`, `AB`, `H`, `2B`, `3B`, `HR`
- `R`, `RBI`, `BB`, `SO`, `HBP`
- `wOBA`, `wRC+` 가능 시 계산
- `BABIP`
- `ISO`
- `Contact%`, `Swing%`, `Zone Contact%` 가능 시 계산

투수:

- `ERA`, `FIP`, `xFIP` 가능 시 계산
- `IP`, `SO`, `BB`, `HR`, `H`, `ER`
- `WHIP`
- `K%`, `BB%`, `K-BB%`
- `GB%`, `FB%`, `HR/9`
- `LOB%`
- `QS`, `SV`, `HLD`

## 17.3 경기별 선수 기록

타자 경기별:

- 경기 날짜
- 상대팀
- 선발투수
- 타순
- 수비포지션
- 선발/교체 여부
- 타석 수
- 안타/장타/볼넷/삼진
- 득점권 상황 성과

투수 경기별:

- 선발/구원 여부
- 투구 수
- 이닝 수
- 상대 타자 수
- 구종별 사용량
- 실점/자책
- 탈삼진/볼넷
- 휴식일

## 18. 구종 단위 데이터 설계

AI 예측에서 가장 중요한 확장 포인트 중 하나다.

## 18.1 투수 구종 정보

각 투수별로 아래 데이터를 수집 또는 파생 계산한다.

- `pitch_type`
- `pitch_name_ko`
- `usage_rate`
- `avg_velocity`
- `max_velocity`
- `spin_rate` 가능 시
- `movement_x`
- `movement_z`
- `zone_rate`
- `whiff_rate`
- `called_strike_rate`
- `putaway_rate`
- `batting_avg_allowed`
- `slugging_allowed`
- `wOBA_allowed`
- `run_value_per_100`
- `win_contribution_rate`

핵심 질문으로 변환하면 아래와 같다.

1. 어떤 구종을 가장 많이 던지는가
2. 어떤 구종의 실점 억제력이 가장 좋은가
3. 어떤 구종이 결정구 역할을 하는가
4. 좌타/우타 상대로 어떤 구종 조합이 다른가
5. 카운트별 구종 패턴은 어떤가

## 18.2 타자 구종 대응 정보

타자별로 아래 데이터를 만든다.

- `vs_fastball_avg`
- `vs_fastball_slg`
- `vs_slider_avg`
- `vs_slider_slg`
- `vs_curve_avg`
- `vs_curve_slg`
- `vs_changeup_avg`
- `vs_changeup_slg`
- `vs_splitter_avg`
- `vs_splitter_slg`
- `vs_sinker_avg`
- `vs_sinker_slg`
- `whiff_rate_by_pitch_type`
- `chase_rate_by_pitch_type`
- `hard_hit_rate_by_pitch_type` 가능 시

핵심 질문:

1. 어떤 공을 잘 치는가
2. 어떤 공을 잘 못 치는가
3. 빠른공 대응이 좋은가
4. 변화구 대응이 좋은가
5. 높은 코스/낮은 코스 중 취약 구역이 있는가

## 19. 투수-타자 상성 데이터

## 19.1 직접 상성

가능하면 타석 단위 또는 최소 선수 대 선수 단위 누적 기록을 저장한다.

- `pitcher_id`
- `batter_id`
- `pa`
- `ab`
- `hits`
- `2b`
- `3b`
- `hr`
- `bb`
- `so`
- `avg`
- `obp`
- `slg`
- `ops`
- `last_seen_date`

## 19.2 간접 상성

직접 표본이 적은 경우 아래 기준으로 일반화한다.

1. 같은 투구 유형의 투수 군집
2. 같은 릴리스/구속대 투수 군집
3. 좌완/우완, 오버/사이드 계열 분류
4. 특정 pitch mix 유사도 기반 군집

즉, 특정 투수와 직접 대결 기록이 적어도 비슷한 프로필 투수군 상대로의 성과를 feature로 사용한다.

## 20. Aging Curve 설계

사용자 요청상 aging curve는 핵심 feature다.

## 20.1 기본 개념

선수 성능은 나이에 따라 상승, 정점, 하락 구간이 다르다.

이를 위해 아래 파생치를 만든다.

- `age_exact`
- `career_year`
- `days_since_debut`
- `age_bucket`
- `position_age_curve_group`

## 20.2 타자 Aging Curve 예시 feature

- 나이 대비 평균 OPS 편차
- 나이 대비 장타율 편차
- 최근 3년 rolling trend
- 시즌 초반/중반/후반 체력 하락 패턴
- 포지션별 aging baseline 대비 초과/미달 성과

## 20.3 투수 Aging Curve 예시 feature

- 구속 감소율
- 구종 usage 변화율
- 탈삼진률 추세
- 볼넷률 추세
- 이닝 소화량 감소 추세
- 선발에서 불펜 전환 시점 탐지

## 20.4 모델 반영 방식

1. raw age 자체를 feature로 사용
2. age x position interaction 추가
3. age x usage interaction 추가
4. 최근 3년 rolling delta로 성능 저하/상승 추정

## 21. 출전빈도와 컨디션 설계

실제 컨디션은 완전한 공식 데이터가 없을 가능성이 높으므로 proxy feature를 체계적으로 설계해야 한다.

## 21.1 타자 컨디션 proxy

- 최근 3경기 출전 여부
- 최근 7일 타석 수
- 최근 7일 OPS
- 최근 14일 OPS
- 연속 선발 경기 수
- 연속 결장 경기 수
- 원정 연전 여부
- 더블헤더 출전 여부
- 야간 경기 연속 여부

## 21.2 투수 컨디션 proxy

- 최근 등판일
- 휴식일 수
- 최근 3경기 투구 수
- 최근 7일 누적 투구 수
- 최근 14일 누적 투구 수
- 직전 경기 구속 변화
- 직전 경기 제구 흔들림 여부
- 불펜 과부하 점수

## 21.3 팀 컨디션 proxy

- 최근 7일 팀 이동거리 추정
- 홈 연전/원정 연전
- 최근 5경기 득점 추세
- 최근 5경기 실점 추세
- 불펜 소모량
- 연장전 여부

## 22. 선수의 모든 정보를 가져오기 위한 소스 전략

현실적으로 단일 소스만으로는 부족할 가능성이 높다.

따라서 소스를 3계층으로 나눈다.

## 22.1 Tier 1: 공식 소스

가장 신뢰도가 높다.

- KBO 기록실
- KBO 선수 조회/등록 현황
- KBO 일정/결과
- KBO 팀/선수 순위

수집 목적:

- 공식 시즌 기록
- 로스터 상태
- 경기 결과
- 선수 기본 프로필

## 22.2 Tier 2: 보강 소스

- Naver 스포츠 KBO 일정/뉴스/선발 정보 노출 영역
- 구단 공식 홈페이지
- 보도자료

수집 목적:

- 선발 예고
- 엔트리 변동
- 부상 관련 공개 정보
- 선발 라인업 힌트

## 22.3 Tier 3: 추론/파생 데이터

직접 값이 없을 때 모델링으로 만든다.

- 컨디션 점수
- fatigue score
- matchup similarity
- aging score
- pitch effectiveness score
- batter vulnerability map

## 23. 고급 DB 스키마 추가안

### `player_profiles`

- `player_id`
- `birth_date`
- `debut_year`
- `height_cm`
- `weight_kg`
- `salary`
- `draft_info`
- `updated_at`

### `player_game_logs`

- `id`
- `game_id`
- `player_id`
- `team_id`
- `opponent_team_id`
- `role`
- `batting_order`
- `position_played`
- `started_flag`
- `minutes_estimate`
- `rest_days`
- `raw_stats_json`

### `pitcher_pitch_type_stats`

- `id`
- `season_year`
- `player_id`
- `pitch_type`
- `usage_rate`
- `avg_velocity`
- `whiff_rate`
- `called_strike_rate`
- `avg_allowed`
- `slg_allowed`
- `run_value`

### `batter_pitch_type_stats`

- `id`
- `season_year`
- `player_id`
- `pitch_type`
- `pa`
- `avg`
- `slg`
- `whiff_rate`
- `chase_rate`
- `contact_rate`
- `hard_hit_rate`

### `pitcher_batter_matchups`

- `id`
- `pitcher_id`
- `batter_id`
- `season_scope`
- `career_scope`
- `pa`
- `avg`
- `ops`
- `so_rate`
- `bb_rate`
- `hr_rate`

### `player_availability`

- `id`
- `player_id`
- `game_date`
- `availability_status`
- `source_type`
- `reason_text`
- `confidence_score`

### `player_form_metrics`

- `id`
- `player_id`
- `snapshot_date`
- `recent_3g_score`
- `recent_7d_score`
- `fatigue_score`
- `usage_score`
- `trend_score`
- `condition_score`

### `player_aging_metrics`

- `id`
- `player_id`
- `season_year`
- `age`
- `career_year`
- `aging_score`
- `velocity_decline_score`
- `power_decline_score`
- `contact_decline_score`

## 24. AI Feature Store 설계

예측 정확도를 높이려면 원천 테이블과 별도로 feature store가 필요하다.

### `game_prediction_features`

카테고리:

1. 팀 feature
2. 선발투수 feature
3. 예상 라인업 feature
4. 불펜 feature
5. 핵심 타자 feature
6. 상성 feature
7. aging feature
8. condition feature

예시 컬럼:

- `home_starting_pitcher_recent_fip`
- `away_starting_pitcher_rest_days`
- `home_projected_lineup_ops_vs_rhp`
- `away_projected_lineup_ops_vs_lhp`
- `home_bullpen_fatigue_score`
- `away_bullpen_fatigue_score`
- `home_lineup_avg_age`
- `away_lineup_avg_age`
- `home_core_hitters_form_score`
- `away_core_hitters_form_score`
- `home_vs_pitch_mix_advantage`
- `away_vs_pitch_mix_advantage`
- `home_matchup_edge_score`
- `away_matchup_edge_score`

## 25. 모델 고도화 로드맵

## 25.1 Stage 1

- 팀 단위 baseline
- 일정/순위/기본 기록 기반 예측

## 25.2 Stage 2

- 선발투수 반영
- 예상 라인업 반영
- 최근 폼과 불펜 피로도 반영

## 25.3 Stage 3

- 구종 단위 feature 반영
- 타자-투수 상성 반영
- aging curve 반영
- 선수 availability 반영

## 25.4 Stage 4

- 경기중 live in-game 업데이트
- 라인업 확정 후 재예측
- 설명형 AI 카드 생성

## 26. 중요한 현실 제약

아래 정보는 확보 난도가 높거나 공식 데이터가 없을 수 있다.

1. 실시간 구속/회전수
2. 완전한 pitch-by-pitch 로그
3. 공식 부상 상세 정보
4. 정확한 컨디션 정보
5. 내부 훈련/체력 데이터

이 경우 전략은 다음과 같다.

1. 공식 데이터로 직접 확보
2. 보강 소스로 공개 정보 보완
3. 없으면 proxy feature 생성
4. 신뢰도 점수와 함께 사용

즉, "모든 정보를 가져온다"는 목표는 맞지만 실제 운영에서는 `직접 수집 + 외부 보강 + 모델 기반 추론` 3단 구조로 가야 한다.

## 27. 추천 다음 작업

이제 다음 단계는 기획이 아니라 데이터 사양서와 실제 구현 착수다.

1. `선수/구종/상성/컨디션`까지 포함한 DB 스키마 상세화
2. `수집 가능한 것 / 추론해야 하는 것`을 source matrix로 분리
3. 예상 라인업과 선발투수 기준 feature builder 설계
4. 실제 크롤러 1차 구현

사용자가 원하면 다음 턴에서 바로 아래 2개 중 하나로 이어서 작업할 수 있다.

1. `초상세 DB ERD + Prisma schema 초안` 작성
2. `수집 소스 매트릭스 문서 + 크롤러 구현 우선순위` 작성
