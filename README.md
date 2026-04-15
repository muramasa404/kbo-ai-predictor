# KBO AI Predictor

## 현재 상태

현재 워크스페이스에는 아래가 포함되어 있습니다.

1. 서비스/DB/수집 아키텍처 문서
2. Prisma 스키마 초안
3. KBO/Naver worker 수집 골격
4. 로컬에서 바로 볼 수 있는 Next.js 프론트 MVP
5. API route + service 레이어

## 로컬에서 프론트 보기

```bash
cd C:\Users\CHJEONG\Desktop\KBO\apps\web
npm install
npm run dev
```

브라우저:

- `http://localhost:3000`

## 루트에서 실행

```bash
cd C:\Users\CHJEONG\Desktop\KBO
npm run dev:web
```

## 현재 데이터 연결 상태

- 프론트는 `service layer`를 통해 데이터를 읽습니다.
- 아직 실제 PostgreSQL과 API가 연결된 상태는 아닙니다.
- `DATABASE_URL`과 Prisma migration, worker 적재가 준비되면 mock fallback을 실데이터로 교체하면 됩니다.

## 현재 주요 경로

- 프론트: `apps/web`
- 워커: `apps/worker`
- Prisma 스키마: `prisma/schema.prisma`
- DB 클라이언트: `packages/db/src/client.ts`

## 오늘 바로 쓰는 방법

DB 연결 없이도 KBO 실시간 타자 기본 기록 API를 바로 사용할 수 있습니다.

```bash
cd C:\Users\CHJEONG\Desktop\KBO
npm run dev:web
```

브라우저/호출 경로:

- 홈 화면: `http://localhost:3000`
- 실시간 타자 기본 기록 API: `http://localhost:3000/api/hitters/basic`
- 정렬 변경 예시: `http://localhost:3000/api/hitters/basic?sort=HIT_CN`

설명:

- `/api/hitters/basic` 는 KBO 공식 기록 페이지를 서버에서 직접 조회해 파싱합니다.
- DB가 비어 있거나 연결되지 않아도 홈 화면 랭킹 카드는 실시간 타자 기록을 fallback으로 사용합니다.
- 예측 카드와 일부 분석 카드는 아직 mock 기반입니다.

## 다음 연결 순서

1. PostgreSQL 연결
2. Prisma generate + migrate
3. worker 수집 실행
4. web service에서 DB read 연결
5. mock 제거

## Supabase + Vercel 연결 기준

- 이 프로젝트의 배포 기준 DB 설정은 `DATABASE_URL` 하나입니다.
- Supabase 대시보드의 connection string에 보이는 `[YOUR-PASSWORD]`는 실제 DB 비밀번호로 직접 바꿔 넣어야 합니다.
- Vercel에는 `DATABASE_URL`만 넣어도 web 앱이 동작하도록 맞췄고, `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`은 로컬 개발용 fallback입니다.
- Supabase에서 DB 비밀번호를 재설정했다면 Vercel의 `DATABASE_URL`도 새 값으로 바꾼 뒤 반드시 다시 배포해야 합니다.

예시:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<REAL_PASSWORD>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require
```

주의:

- `<REAL_PASSWORD>` 자리에 실제 비밀번호가 들어가야 합니다.
- `[YOUR-PASSWORD]` 또는 `YOUR_PASSWORD` 같은 placeholder가 그대로 들어가면 인증이 실패합니다.
- 비밀번호 안에 `@`, `:`, `/` 같은 문자가 있으면 URL 인코딩된 connection string을 복사해서 사용하는 편이 안전합니다.

## 현재 검증 완료 항목

1. `apps/web` 빌드 성공
2. `apps/worker` 타입체크 성공
3. `prisma validate` 성공
4. `prisma generate` 성공
5. `web` 서비스 계층에 DB read + mock fallback 연결 완료

## DB 마이그레이션

루트 `.env`에는 로컬 기본값이 들어 있습니다.

로컬 PostgreSQL이 없다면 아래 Docker 구성으로 바로 띄울 수 있습니다.

```bash
cd C:\Users\CHJEONG\Desktop\KBO
docker compose up -d
```

```bash
cd C:\Users\CHJEONG\Desktop\KBO
npm run prisma:migrate:dev
npm run db:seed
```

주의:

- 현재 `.env`는 로컬 PostgreSQL 예시값입니다.
- 실제로 `localhost:5432`에 PostgreSQL과 `kbo_ai` DB가 준비되어 있어야 migrate가 성공합니다.
- migrate 후 `npm run db:seed`로 2026 시즌과 10개 구단 마스터를 넣을 수 있습니다.

현재 시드 실행 실패 원인:

- `localhost:5432` PostgreSQL 인증 실패
- 즉, DB 서버가 꺼져 있거나 비밀번호가 `.env`와 다릅니다.
