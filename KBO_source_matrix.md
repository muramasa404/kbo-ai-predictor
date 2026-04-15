# KBO AI 데이터 Source Matrix

## 1. 목적

이 문서는 KBO AI 승부예측 서비스에서 필요한 데이터를 아래 3가지로 구분한다.

1. 직접 수집 가능한 데이터
2. 외부 공개 정보로 보강 가능한 데이터
3. 직접 수집이 어려워 proxy 또는 AI 추론이 필요한 데이터

이 문서를 기준으로 다음을 결정한다.

1. 어떤 크롤러를 먼저 만들어야 하는가
2. 어떤 feature는 신뢰도가 높은가
3. 어떤 feature는 추정치이므로 confidence를 낮춰야 하는가

## 2. 신뢰도 등급

- `A`: 공식 원천, 구조 안정, 직접 수집 가능
- `B`: 공개 소스 보강 가능, 구조 변경 가능성 있음
- `C`: 일부만 수집 가능, 나머지는 proxy 필요
- `D`: 직접 수집 어려움, 대부분 추론 필요

## 3. 수집 방식 코드

- `API`: 내부 endpoint 또는 공개 API 호출
- `HTML`: HTML 파싱
- `BROWSER`: Playwright 등 브라우저 렌더링 필요
- `DERIVED`: 원천 데이터 기반 계산
- `MANUAL`: 수동 검수 또는 운영 보강 필요

## 4. Source Inventory

### 4.1 공식 우선 소스

1. `KBO 기록실`
2. `KBO 팀 순위`
3. `KBO 선수 순위`
4. `KBO 경기 일정/결과`
5. `KBO 선수 조회 / 등록 현황`

### 4.2 보강 소스

1. `Naver KBO 일정`
2. `Naver 경기 프리뷰/뉴스/라인업 노출 영역`
3. `구단 공식 사이트`
4. `보도자료`

### 4.3 내부 파생 소스

1. `game logs -> form metrics`
2. `season stats -> aging curve`
3. `pitch type stats + lineup -> matchup edge`
4. `rest days + usage -> fatigue score`

## 5. 데이터 그룹별 Matrix

## 5.1 팀/시즌/경기 마스터

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 시즌 연도/기간 | KBO 일정/결과 | 없음 | HTML/API | A | `seasons` | 시즌 캘린더 기준 |
| 팀 코드/팀명 | KBO 팀 순위 | KBO 구단 소개 | HTML | A | `teams` | 정규화 키 중요 |
| 구장명 | KBO 일정/결과 | Naver 일정 | HTML | A | `stadiums` | 구장 alias 정규화 필요 |
| 경기 일정 | KBO 일정/결과 | Naver 일정 | HTML/API | A | `games` | 날짜별 백필 가능 |
| 경기 결과 | KBO 일정/결과 | Naver 일정 | HTML/API | A | `game_results` | 우천취소 상태 포함 |
| 중계 채널 | KBO 일정/결과 | Naver 일정 | HTML | B | `game_broadcasts` | 구조 변경 가능 |

## 5.2 선수 프로필/등록 정보

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 선수 고유 ID | KBO 선수 조회 | 없음 | HTML/API | A | `players` | 이름 중복 방지 핵심 |
| 이름/팀/포지션 | KBO 선수 조회 | KBO 등록 현황 | HTML | A | `players` | 현재 팀 기준 |
| 투타 정보 | KBO 선수 조회 | 구단 사이트 | HTML | A | `players` | 좌/우/스위치 |
| 생년월일 | KBO 선수 조회 | 구단 사이트 | HTML | B | `player_profiles` | aging curve 핵심 |
| 키/몸무게 | KBO 선수 조회 | 구단 사이트 | HTML | B | `player_profiles` | 누락 가능성 있음 |
| 데뷔연도 | KBO 선수 조회 | 언론/구단 | HTML | B | `player_profiles` | 커리어 연차 계산용 |
| 연봉/드래프트 | KBO 선수 조회 | 보도자료 | HTML/MANUAL | C | `player_profiles` | 필수 feature는 아님 |
| 부상 상태 | 보도자료/구단 | Naver 뉴스 | HTML/MANUAL | D | `player_profiles`, `player_availability` | 공식 상세 부상 데이터 부족 |
| 등록/말소 상태 | KBO 등록 현황 | Naver 뉴스 | HTML | B | `player_availability` | 엔트리 변동 추적 |

## 5.3 팀 순위/상태

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 일자별 팀 순위 | KBO 팀 순위 | 없음 | HTML/API | A | `team_rank_daily` | 핵심 baseline feature |
| 승/패/무/승률 | KBO 팀 순위 | 없음 | HTML | A | `team_rank_daily` | |
| 게임차 | KBO 팀 순위 | 없음 | HTML | A | `team_rank_daily` | |
| 최근 10경기 | KBO 팀 순위 | 없음 | HTML | A | `team_rank_daily` | |
| 홈/원정 성적 | KBO 팀 순위 | 없음 | HTML | A | `team_rank_daily` | |
| 팀간 상대전적 | KBO 팀 순위 | 없음 | HTML | B | 별도 테이블 확장 가능 | 추후 `team_vs_team_daily` 가능 |

## 5.4 선수 시즌 누적 기록

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 타자 기본 기록 | KBO 기록실 | 없음 | HTML/API | A | `player_hitter_season_stats` | 현재 수집 가능성 높음 |
| 투수 기본 기록 | KBO 기록실 | 없음 | HTML/API | A | `player_pitcher_season_stats` | 동일 패턴으로 수집 |
| 상황별 타격 기록 | KBO 기록실 | 없음 | HTML/API | A | 시즌/상황 raw snapshot | 월별/요일별/상대별 등 |
| 상황별 투수 기록 | KBO 기록실 | 없음 | HTML/API | A | 시즌/상황 raw snapshot | split feature 생성용 |
| OPS/WHIP 등 기본율 | KBO 기록실 | 내부 계산 | HTML/DERIVED | A | 시즌 stats | |
| wOBA/wRC+/FIP/xFIP | KBO 기록실 | 내부 계산 | DERIVED | B | 시즌 stats | 계산식 별도 필요 |

## 5.5 경기별 선수 로그

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 선수 출전 여부 | KBO 경기 데이터 | Naver 경기 페이지 | HTML/API | B | `player_game_logs` | 상세 박스스코어 필요 |
| 선발/교체 여부 | KBO 경기 상세 | Naver 경기 페이지 | HTML/BROWSER | B | `player_game_logs` | 소스 탐색 필요 |
| 타순/포지션 | KBO 경기 상세 | Naver 라인업 | HTML/BROWSER | B | `player_game_logs` | |
| 타자 경기별 성적 | KBO 경기 상세 | Naver 경기 페이지 | HTML/BROWSER | B | `player_game_logs` | raw json 권장 |
| 투수 경기별 성적 | KBO 경기 상세 | Naver 경기 페이지 | HTML/BROWSER | B | `player_game_logs` | 투구 수 중요 |
| 선발투수 | Naver 경기 페이지 | KBO 프리뷰/뉴스 | HTML/BROWSER | B | 별도 projected lineup layer | 경기 전 예측에 중요 |
| 경기 전 라인업 | Naver 경기 페이지 | 구단 SNS/뉴스 | HTML/BROWSER/MANUAL | C | projected lineup layer | 경기 직전 확정 가능 |

## 5.6 구종 데이터

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 투수 구종 종류 | 외부 pitch log 소스 필요 | 없음 | API/HTML | C | `pitcher_pitch_type_stats` | KBO 공식만으로 부족 가능성 큼 |
| 구종 사용률 | 외부 pitch log 소스 필요 | 없음 | API/DERIVED | C | `pitcher_pitch_type_stats` | pitch-by-pitch 필요 |
| 평균 구속 | 외부 pitch log 소스 필요 | 없음 | API | C | `pitcher_pitch_type_stats` | 공개 범위 확인 필요 |
| 회전수/무브먼트 | 외부 tracking 소스 필요 | 없음 | API | D | `pitcher_pitch_type_stats` | 확보 어려울 가능성 높음 |
| 구종별 피안타율/헛스윙률 | 외부 pitch log 소스 필요 | 없음 | API/DERIVED | C | `pitcher_pitch_type_stats` | |
| 타자 구종 대응 성과 | 외부 pitch log 소스 필요 | 없음 | API/DERIVED | C | `batter_pitch_type_stats` | |

중요:

현재 사용자가 명시한 필수 KBO/Naver 링크만으로는 `정교한 구종 단위 데이터`가 충분하지 않을 수 있다.
따라서 이 구간은 추가 소스 탐색이 필요하다.

## 5.7 투수-타자 상성

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 직접 상대 전적 | 경기 상세/타석 로그 | 외부 박스스코어 | HTML/API | C | `pitcher_batter_matchups` | 표본 부족 이슈 |
| 시즌 기준 상성 | 경기 로그 누적 | 없음 | DERIVED | B | `pitcher_batter_matchups` | |
| 커리어 기준 상성 | 과거 시즌 백필 | 없음 | DERIVED | B | `pitcher_batter_matchups` | |
| 유사 투수군 상성 | 내부 군집화 | 없음 | DERIVED | C | feature store | 직접 데이터 부족 보완 |

## 5.8 출전빈도/휴식/컨디션

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 최근 출전 경기 수 | player game logs | 없음 | DERIVED | A | `player_form_metrics` | |
| 휴식일 수 | 경기 로그 | 없음 | DERIVED | A | `player_game_logs`, `player_form_metrics` | |
| 최근 타석/투구 수 | 경기 로그 | 없음 | DERIVED | A | `player_form_metrics` | |
| 연속 선발 경기 수 | 경기 로그 | 없음 | DERIVED | A | `player_form_metrics` | |
| 불펜 과부하 점수 | 투수 경기 로그 | 없음 | DERIVED | B | `player_form_metrics`, team feature | |
| 이동 피로도 | 일정/구장 | 지도 계산 | DERIVED | C | team/player form | 거리 계산식 필요 |
| 실제 컨디션 | 공식 공개 없음 | 뉴스/인터뷰 | MANUAL/DERIVED | D | `player_form_metrics`, `player_availability` | proxy 중심 |

## 5.9 Aging Curve

| 데이터 항목 | 우선 소스 | 보조 소스 | 방식 | 신뢰도 | 저장 테이블 | 비고 |
|---|---|---|---|---|---|---|
| 나이 | 선수 프로필 | 구단 사이트 | HTML/DERIVED | B | `player_profiles` | 생년월일 필요 |
| 커리어 연차 | 프로필/시즌 로그 | 없음 | DERIVED | B | `player_aging_metrics` | |
| 최근 3년 성능 추세 | 시즌 기록 | 없음 | DERIVED | A | `player_aging_metrics` | |
| 구속 하락 추세 | pitch type stats | 없음 | DERIVED | C | `player_aging_metrics` | pitch data 확보 필요 |
| 장타력 하락 추세 | 시즌 기록 | 없음 | DERIVED | A | `player_aging_metrics` | |
| contact decline | 시즌 기록 | 없음 | DERIVED | B | `player_aging_metrics` | 계산식 정의 필요 |

## 6. 직접 수집 불가 가능성이 높은 항목

아래는 초기 단계에서 바로 확보하기 어려운 항목이다.

1. pitch-by-pitch 원천 로그 전체
2. 구속, 회전수, 무브먼트의 완전한 공식 데이터
3. 실시간 확정 라인업의 안정적 공식 API
4. 부상 severity와 회복 단계
5. 훈련량, 수면, 웨이트, 메디컬 데이터
6. 실제 심리/컨디션 데이터

이 항목들은 아래 전략으로 대체한다.

1. 공개 가능한 부분만 수집
2. 없으면 `proxy score` 생성
3. 모델 입력에 `source_confidence`를 반영
4. 중요 feature일수록 결측 허용 전략 설계

## 7. Proxy 설계 원칙

## 7.1 컨디션 proxy

- 최근 3경기 성적
- 최근 7일 출전량
- 최근 7일 휴식일
- 최근 14일 투구 수 또는 타석 수
- 연전/원정 연속 여부

## 7.2 부상/가용성 proxy

- 엔트리 말소 여부
- 최근 경기 미출전 연속 일수
- 경기 직전 선발 제외 반복
- 뉴스 키워드 탐지

## 7.3 구종 대응 proxy

- pitch data가 부족하면 좌우 유형, 구속대, 볼넷/삼진형 투수 유형으로 군집화

## 8. 크롤러 구현 우선순위

## Phase 1: 반드시 먼저 구현

1. `KBO 일정/결과 collector`
2. `KBO 팀 순위 collector`
3. `KBO 기록실 타자/투수 시즌 기록 collector`
4. `KBO 선수 조회/등록 현황 collector`
5. `Naver 날짜 순회 schedule collector`

이 단계에서 확보되는 것:

- 경기 일정/결과
- 팀 순위
- 선수 프로필 기본값
- 시즌 누적 기록
- 날짜 기반 백필 구조

## Phase 2: 예측 정확도 개선

1. `KBO/Naver 경기 상세 collector`
2. `player_game_logs builder`
3. `projected starters / lineup collector`
4. `player_form_metrics batch`
5. `player_aging_metrics batch`

이 단계에서 확보되는 것:

- 출전빈도
- 휴식일
- 선발/교체
- 최근 폼
- aging curve

## Phase 3: 고급 AI 분석

1. `pitch data source 탐색`
2. `pitcher_pitch_type_stats collector`
3. `batter_pitch_type_stats builder`
4. `pitcher_batter_matchups builder`
5. `game_prediction_features advanced builder`

이 단계에서 확보되는 것:

- 구종 단위 우위
- 상성 기반 설명형 예측
- 선발투수 대 라인업 적합도

## 9. 권장 운영 정책

1. 수집 성공률이 낮은 source는 `A/B/C/D` 신뢰도 태그를 프론트 노출에는 직접 사용하지 않더라도 내부적으로 유지한다.
2. `A/B` 데이터만으로도 baseline 모델은 운영 가능하게 만든다.
3. `C/D` 데이터는 고급 feature로만 넣고, 결측 시 graceful fallback 한다.
4. 경기 직전 예측에서는 lineup/availability 미확정 상태와 확정 상태를 분리해 두 번 예측한다.

## 10. 바로 다음 구현 문서 추천

이 문서 다음으로 가장 유용한 산출물은 아래 둘이다.

1. `collector별 입력 URL, 파서 selector, upsert key` 문서
2. `feature builder spec` 문서

추천 순서:

1. collector spec
2. feature builder spec
3. 실제 코드 생성
