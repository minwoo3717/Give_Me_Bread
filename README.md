# Give_Me_Bread · 오븐노트 (Oven Note)

제과·제빵 레시피 모음 사이트입니다. MVP에는 **브라운버터 휘낭시에** 레시피 한 개가 들어 있습니다.
Next.js 16 풀스택으로 만들었고, AWS(서울)에 운영 수준으로 배포하는 것까지 포함합니다.

- 공개 페이지: 레시피 목록, 레시피 상세(배합 배수 계산기, 단계별 체크리스트, 팁·보관·응용), Recipe JSON-LD, 사이트맵
- 관리자 `/admin`: 로그인, 레시피 작성·수정·공개·삭제, 비밀번호 변경
- 인프라: CloudFront + WAF → 내부 ALB → ECS Fargate(오토스케일링) → RDS PostgreSQL 18. Terraform으로 관리하고, GitHub Actions로 배포합니다(OIDC)

자세한 내용은 아래 문서에 있습니다.

| 문서 | 내용 |
|---|---|
| [docs/DEPLOY.md](docs/DEPLOY.md) | AWS 계정 준비부터 첫 배포까지 단계별 가이드 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조도, 설계 결정과 이유, 트래픽 산정 |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | 알람 대응, 롤백, 복구 훈련, 운영 작업 |

## 로컬 개발

Docker 없이 바로 돌릴 수 있습니다. Windows PowerShell에서 `pnpm`이 "스크립트를 실행할 수 없으므로" 오류를 내면 `pnpm` 대신 `pnpm.cmd`를 쓰세요(예: `pnpm.cmd dev`).
처음 실행할 때는 아래 순서를 모두 따라야 합니다. DB가 비어 있으면 홈 화면이 "잠시 문제가 생겼어요" 오류를 냅니다.

```bash
pnpm install
cp .env.example .env.local        # 필요하면 값 수정
pnpm db:dev                       # 터미널 1: 로컬 PostgreSQL 18 (localhost:5433)
pnpm db:migrate && pnpm db:seed   # 터미널 2: 스키마 + 휘낭시에 레시피
pnpm admin:create                 # .env.local의 ADMIN_EMAIL / ADMIN_PASSWORD로 관리자 생성
pnpm dev                          # http://localhost:3000
```

Docker Desktop이 있으면 `docker compose up -d db`로 Postgres를 띄워도 됩니다(같은 포트 5433).
`docker compose --profile app up --build`를 실행하면 운영 이미지를 그대로 띄웁니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | 품질 검사. 테스트는 DB가 있으면 통합 테스트까지 실행 |
| `pnpm db:generate` | `src/lib/db/schema.ts`를 바꾼 뒤 SQL 마이그레이션 생성 (`drizzle/`) |
| `pnpm db:migrate` / `pnpm db:seed` | 마이그레이션 적용 / 시드 |
| `pnpm admin:create` | 관리자 생성 (`-- --reset`으로 비밀번호 재설정) |
| `pnpm build:scripts` | 운영 이미지용 ops 스크립트 번들 (`dist/scripts/*.cjs`) |
| `pnpm smoke <url>` | 배포된 사이트 스모크 테스트 |

## 구조

```
src/
  app/                  페이지 (App Router)
    page.tsx            홈 (레시피 목록)
    recipes/[slug]/     레시피 상세
    admin/              관리자 (login, (protected)/...)
    api/health/         헬스체크
    sitemap.ts robots.ts opengraph-image.tsx
  components/           배합 계산기, 단계 체크리스트, 일러스트
  lib/
    db/                 Drizzle 스키마, 커넥션 설정
    auth/               비밀번호(scrypt), 세션, 로그인 제한
    recipes.ts          데이터 접근
    recipe-schema.ts    zod 검증 (관리자 폼과 시드가 함께 사용)
    cdn.ts              CloudFront 무효화
  content/recipes/      시드 레시피 (휘낭시에)
  proxy.ts              /admin 접근 시 1차 리다이렉트
server-entry.cjs        운영 진입점 (0.0.0.0 바인딩, 3xx·5xx 응답 no-store 강제)
drizzle/                SQL 마이그레이션
scripts/                migrate / seed / create-admin / dev-db / smoke, ci/
infra/terraform/        bootstrap, envs/prod, modules/*
.github/workflows/      ci.yml, deploy.yml, ops.yml
loadtest/               k6 부하 테스트
```
