# KBO Collector Spec

## 1. 목적

이 문서는 실제 수집기 구현 전에 각 collector의 다음 항목을 고정하기 위한 문서다.

1. source URL
2. 수집 단위
3. 요청 파라미터
4. 파싱 대상 필드
5. upsert key
6. 저장 테이블
7. 실행 주기
8. 실패 fallback

## 2. 공통 규칙

## 2.1 수집 파이프라인 공통 단계

1. URL 또는 내부 endpoint 호출
2. `source_snapshots`에 raw 응답 저장
3. parser로 구조화
4. normalizer로 팀명/선수명/날짜 정규화
5. upsert 실행
6. 메트릭 기록 및 실패시 Sentry 전송

## 2.2 공통 필드

모든 collector는 아래 메타 필드를 남긴다.

- `sourceName`
- `requestUrl`
- `requestDateKey`
- `collectedAt`
- `contentHash`
- `responseStatus`

## 2.3 실행 모드

- `backfill`: 과거 시즌 전체 적재
- `daily`: 일간 배치
- `intraday`: 경기일 집중 갱신
- `repair`: 특정 날짜/선수/경기 재수집

## 3. Priority Phase 1 Collectors

## 3.1 `kbo-schedule-collector`

### 목적

- 경기 일정/결과/구장/상태/중계 데이터 확보
- `games`, `game_results`, `game_broadcasts` 생성의 기준 collector

### Source

- 메인 URL: `https://www.koreabaseball.com/Schedule/Schedule.aspx`
- 후보 내부 endpoint: 페이지 네트워크 탐색 필요

### 수집 단위

- 월 단위 또는 날짜 단위

### 입력

- `year`
- `month`
- `date` optional
- `teamCode` optional
- `gameType`

### 파싱 대상

- 경기 날짜
- 경기 시간
- 홈팀
- 원정팀
- 경기 상태
- 구장
- TV/라디오 중계
- 비고
- 결과 점수

### 저장 테이블

- `games`
- `game_results`
- `game_broadcasts`
- `source_snapshots`

### Upsert key

- `games.source_game_key`
- fallback: `game_date + away_team + home_team + stadium + scheduled_at`

### 주기

- 백필: 시즌 전체 월 단위
- 일중: 10~30분 간격

### 실패 fallback

1. 내부 API 실패시 HTML 파싱
2. KBO 실패시 Naver schedule로 상태 보완

## 3.2 `kbo-team-rank-daily-collector`

### 목적

- 일자별 팀 순위와 승률 흐름 확보

### Source

- URL: `https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx`

### 수집 단위

- 날짜 단위

### 입력

- `date`
- `seasonYear`

### 파싱 대상

- 순위
- 팀명
- 경기수
- 승/패/무
- 승률
- 게임차
- 최근 10경기
- 연속
- 홈 성적
- 방문 성적
- 팀간 승패표 optional

### 저장 테이블

- `team_rank_daily`
- optional future: `team_vs_team_daily`
- `source_snapshots`

### Upsert key

- `rankDate + teamId`

### 주기

- 새벽 전체 갱신
- 경기일 종료 후 재갱신

### 실패 fallback

1. 이전 일자 데이터로 서비스 fallback
2. 당일 랭킹 미수집 시 최근값 표시

## 3.3 `kbo-hitter-season-collector`

### 목적

- 타자 시즌 누적 기록 수집

### Source

- URL: `https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx?sort=HRA_RT`

### 수집 단위

- 시즌 x 리그구분 x 팀필터 x 상황필터

### 입력

- `seasonYear`
- `gameType`
- `teamCode` optional
- `situationGroup1` optional
- `situationGroup2` optional
- `page`

### 파싱 대상

- 선수명
- 팀명
- AVG
- G, PA, AB, R, H, 2B, 3B, HR, TB, RBI
- SAC, SF
- 페이지별 전체 row

### 저장 테이블

- `player_hitter_season_stats`
- `players` partial upsert
- raw situation snapshot storage
- `source_snapshots`

### Upsert key

- `seasonId + playerId`

### 주기

- 새벽 전체 갱신
- 경기일 종료 후 재갱신

### 실패 fallback

1. 페이지 파싱 실패시 raw snapshot만 저장
2. 기본기록 우선, 상황별 기록은 후순위 재시도

## 3.4 `kbo-pitcher-season-collector`

### 목적

- 투수 시즌 누적 기록 수집

### Source

- KBO 기록실 투수 기록 페이지

### 수집 단위

- 시즌 x 리그구분 x 팀필터 x 상황필터

### 입력

- `seasonYear`
- `gameType`
- `teamCode` optional
- `situationGroup1` optional
- `situationGroup2` optional
- `page`

### 파싱 대상

- 선수명
- 팀명
- ERA, G, GS, W, L, SV, HLD, IP, H, HR, BB, SO, WHIP 등

### 저장 테이블

- `player_pitcher_season_stats`
- `players` partial upsert
- raw situation snapshot storage
- `source_snapshots`

### Upsert key

- `seasonId + playerId`

### 주기

- 새벽 전체 갱신
- 경기일 종료 후 재갱신

## 3.5 `kbo-top5-collector`

### 목적

- 메인 화면용 TOP5 랭킹 카드 수집

### Source

- URL: `https://www.koreabaseball.com/Record/Ranking/Top5.aspx`

### 수집 단위

- 날짜 스냅샷 단위

### 입력

- `seasonYear`
- `snapshotDate`

### 파싱 대상

- 카테고리명
- 타자/투수 구분
- 순위
- 선수명
- 팀명
- 값

### 저장 테이블

- `ranking_snapshots`
- `source_snapshots`

### Upsert key

- `snapshotDate + category + rank + playerId`

### 주기

- 하루 1~2회

## 3.6 `kbo-player-master-collector`

### 목적

- 선수 마스터/프로필/등록 정보 확보

### Source

- KBO 선수 조회
- KBO 선수 등록 현황

### 수집 단위

- 선수 목록 페이지 단위
- 팀 단위

### 입력

- `teamCode` optional
- `page`

### 파싱 대상

- source player id
- 선수명
- 팀명
- 포지션
- 투타
- 생년월일
- 신장/체중
- 데뷔연도
- 상태

### 저장 테이블

- `players`
- `player_profiles`
- `player_availability` partial
- `source_snapshots`

### Upsert key

- `players.source_player_id`

### 주기

- 새벽 1회
- 엔트리 변동 기간 추가 갱신

## 3.7 `naver-schedule-collector`

### 목적

- KBO 일정/결과 보강
- 경기 상태, 모바일 노출, 선발/프리뷰 확장용 원천 확보

### Source

- URL pattern: `https://m.sports.naver.com/kbaseball/schedule/index?category=kbo&date=YYYY-MM-DD`
- 내부 API endpoint 탐색 필요

### 수집 단위

- 날짜 단위

### 입력

- `date`

### 파싱 대상

- 날짜별 경기 목록
- 경기 상태
- 홈/원정팀
- 경기 링크
- preview/gamecenter link optional
- 선발 노출 시 선발투수

### 저장 테이블

- external snapshot table future
- `source_snapshots`
- optional projected starter cache

### Upsert key

- `date + team pairing + external link`

### 주기

- 경기일 10~30분 간격
- 백필 시 날짜 순회

### 실패 fallback

1. HTML 실패시 내부 API 재탐색
2. KBO 일정 데이터만으로 서비스 지속

## 4. Phase 2 Collectors

## 4.1 `kbo-game-detail-collector`

### 목적

- 경기별 박스스코어와 선수 로그 확보

### 필요성

- `player_game_logs`
- `player_form_metrics`
- 출전 빈도 및 휴식일 계산

### 입력

- `gameId`

### 파싱 대상

- 선발 라인업
- 타순/포지션
- 타자 경기 성적
- 투수 경기 성적
- 투구 수
- 교체 여부

### 저장 테이블

- `player_game_logs`
- `source_snapshots`

### Upsert key

- `gameId + playerId`

## 4.2 `naver-game-preview-collector`

### 목적

- 경기 전 예상 선발, 프리뷰 텍스트, 라인업 힌트 보강

### 저장 대상

- future projected lineup table
- future projected starter table
- `source_snapshots`

## 5. Phase 3 Collectors

## 5.1 `pitch-data-collector`

### 목적

- 구종별 사용률과 효율 확보

### 주의

- 현재 명시된 필수 소스만으로는 부족할 수 있음
- 별도 source discovery 필요

### 저장 테이블

- `pitcher_pitch_type_stats`
- `batter_pitch_type_stats`

## 5.2 `matchup-builder`

### 목적

- 경기 로그 또는 타석 로그 기반 투수-타자 상성 생성

### 저장 테이블

- `pitcher_batter_matchups`

## 6. Normalizer 규칙

## 6.1 팀명 정규화

- `KIA`, `기아` -> `KIA`
- `KT`, `kt wiz` -> `KT`
- 약칭/정식명 모두 alias map 유지

## 6.2 선수명 정규화

- 이름만으로 매칭하지 않음
- 최대한 `source player id` 사용
- 이름 충돌 시 팀, 포지션, 생년월일 병행 확인

## 6.3 날짜 정규화

- DB 저장은 `UTC` 또는 서비스 표준 timezone 하나로 통일
- 표시만 `Asia/Seoul`

## 7. Batch 우선순위

1. `schedule`
2. `team-rank`
3. `player-master`
4. `season-stats`
5. `top5`
6. `game-detail`
7. `naver-preview`
8. `pitch-data`

## 8. 실제 구현 순서

1. `kbo-schedule-collector`
2. `kbo-team-rank-daily-collector`
3. `kbo-player-master-collector`
4. `kbo-hitter-season-collector`
5. `kbo-pitcher-season-collector`
6. `naver-schedule-collector`
7. `kbo-game-detail-collector`
