# Vercel + Supabase 설정

이 프로젝트의 배포용 DB 설정은 `DATABASE_URL` 하나를 기준으로 맞춰져 있습니다.

## 1. Supabase에서 가져올 값

Supabase Dashboard → **Connect** 또는 **Database** → **Connection string** 에서 Postgres URI를 복사합니다.

- `[YOUR-PASSWORD]` 또는 비슷한 placeholder가 보이면 실제 DB 비밀번호로 바꿔야 합니다.
- 비밀번호를 모르면 Supabase Dashboard에서 DB 비밀번호를 재설정한 뒤 새 값으로 URI를 다시 복사합니다.

예시:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<REAL_PASSWORD>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require
```

## 2. Vercel에 넣을 값

Vercel Project → **Settings** → **Environment Variables**

- Key: `DATABASE_URL`
- Value: Supabase에서 복사한 실제 Postgres connection string 전체
- Environment: `Production`, `Preview` 둘 다 권장

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`은 Vercel에 넣지 않아도 됩니다. 이 값들은 로컬 fallback 용도입니다.

## 3. 적용 순서

1. `DATABASE_URL` 저장
2. **Redeploy** 실행
3. 배포 후 앱에서 DB 연결 확인

## 4. 자주 나는 실수

- `[YOUR-PASSWORD]`를 그대로 둠
- Supabase API Key를 DB 비밀번호로 착각함
- 비밀번호를 바꾼 뒤 Vercel의 `DATABASE_URL`은 안 바꿈
- 환경변수만 저장하고 재배포하지 않음
