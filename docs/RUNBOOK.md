# 운영 런북

알람이 울렸을 때나 운영 작업을 할 때 보는 문서입니다. 리소스 이름은 모두 `oven-note-prod-*`입니다.

## 어디를 보나

| 무엇 | 위치 |
|---|---|
| 대시보드 | CloudWatch → Dashboards → `oven-note-prod` |
| 앱 로그 | CloudWatch Logs `/ecs/oven-note-prod/web` (JSON 한 줄씩) |
| 마이그레이션·운영 태스크 로그 | `/ecs/oven-note-prod/ops` |
| DB 느린 쿼리 (1초 초과) | `/aws/rds/instance/oven-note-prod-db/postgresql` |
| 배포 이력 | GitHub Actions → Deploy, ECS → 서비스 → Deployments |
| WAF가 막은 요청 | WAF → Web ACLs (Global/us-east-1) → `oven-note-prod-edge` → Sampled requests |

### Logs Insights 쿼리 모음

```
# 최근 에러
fields @timestamp, msg, err, path, digest
| filter level = "error"
| sort @timestamp desc
| limit 50

# 로그인 실패가 많은 IP
filter msg = "login failed" or msg = "login blocked by rate limit"
| stats count(*) as n by ip
| sort n desc

# 레시피 변경 이력
filter msg like /recipe (saved|deleted|status changed)/
| fields @timestamp, msg, id, slug, status
```

---

## 알람별 대응

### `app-5xx` / `app-errors`: 앱이 에러를 냄

1. 위의 "최근 에러" 쿼리로 메시지와 경로를 확인합니다.
2. 배포 직후에 났다면 **롤백**합니다(아래). 원인은 그다음에 고칩니다.
3. `ECONNREFUSED`나 `timeout` 같은 DB 에러라면 RDS 상태(재부팅, 유지보수, 스토리지)를 확인합니다.

### `alb-5xx` / `healthy-hosts-low`: 살아 있는 태스크가 부족함

1. ECS → 서비스 → Tasks → Stopped 탭에서 `Stopped reason`을 봅니다.
   - `CannotPullContainerError`: 이미지 태그가 잘못됐거나 ECR 권한 또는 네트워크 문제입니다.
   - `ResourceInitializationError ... ssm`: SSM 파라미터나 실행 역할 권한 문제입니다.
   - `Essential container exited`: 앱이 시작하자마자 죽은 것입니다. 로그를 보세요.
2. 배포 중이라면 서킷 브레이커가 자동으로 롤백합니다. `ecs-deployment-failed` 메일이 함께 옵니다.
3. 첫 `terraform apply` 직후라면 정상입니다(아직 이미지가 없음). 첫 배포를 실행하세요.

### `latency-p95`: 오리진이 느림

1. 대시보드에서 태스크 CPU를 확인합니다. CPU가 높고 태스크 수가 최대(6)라면 `web_max_tasks`를 올립니다.
2. DB CPU와 느린 쿼리 로그를 봅니다. 인덱스 누락일 가능성이 큽니다.
3. CloudFront 캐시가 적중하고 있는지 확인합니다. 응답 헤더 `x-cache: Hit from cloudfront`가 보여야 합니다.
   Miss만 나온다면 캐시 정책이 바뀌었거나, 앱의 `Cache-Control` 설정이 깨진 것입니다.

### `web-cpu-high` / `web-memory-high`

- CPU: 오토스케일링(목표 60%)이 따라가지 못하는 상태입니다. 최대 태스크 수를 늘리거나 태스크 크기(`web_cpu`)를 키웁니다.
- 메모리: 시간이 지날수록 계속 오르면 누수입니다. 새 배포로 태스크를 교체해 일단 막고, 원인을 찾습니다.

### `db-cpu-high` / `db-cpu-credits-low` / `db-connections-high` / `db-storage-low`

- 크레딧이 계속 줄어든다면 인스턴스가 작은 것입니다. `db_instance_class = "db.t4g.small"`로 올립니다(재시작이 필요하니 유지보수 시간에).
- 연결 수는 `태스크 수 × DB_POOL_MAX(5)`입니다. 롤링 배포 중에는 태스크가 최대 2배(12개)까지 늘어나므로 최악의 경우 60입니다.
  micro의 한도는 약 80입니다. 태스크를 크게 늘릴 예정이면 RDS Proxy나 더 큰 인스턴스를 검토하세요.
- 스토리지는 100GB까지 자동으로 늘어납니다(`max_allocated_storage`). 그래도 알람이 오면 무엇이 쌓이고 있는지 확인하세요.

### 예산 알림

Cost Explorer에서 서비스별 금액을 확인합니다. 흔한 원인은 CloudFront 데이터 전송(트래픽 급증이나 봇), 로그 수집량 폭증, 잊고 켜 둔 리소스입니다.

---

## 운영 작업

### 롤백

방법 1 (가장 빠름): ECS 콘솔 → 서비스 → **Update service**에서 이전 태스크 정의 리비전을 선택하고 Force new deployment를 켭니다.

방법 2 (CLI):

```bash
aws ecs list-task-definitions --region ap-northeast-2 --family-prefix oven-note-prod-web --sort DESC --max-items 5
# 고르기 전에 이미지 태그가 git SHA인지 확인하세요 (":bootstrap"이면 고르지 않음)
aws ecs describe-task-definition --region ap-northeast-2 --task-definition oven-note-prod-web:<리비전> \
  --query 'taskDefinition.containerDefinitions[0].image'
aws ecs update-service --region ap-northeast-2 --cluster oven-note-prod --service oven-note-prod-web \
  --task-definition oven-note-prod-web:<이전 리비전>
```

방법 1이나 2로 롤백했다면 마지막에 CDN 캐시를 비워, 문제 버전의 HTML이 남지 않게 합니다.

```bash
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

방법 3 (정석): 문제 커밋을 `git revert`하고 push합니다. 그러면 CI를 거쳐 다시 배포됩니다.

> 마이그레이션은 되돌려지지 않습니다. 그래서 스키마 변경은 **확장 → 배포 → 정리** 순서로 나눕니다.
> 예를 들어 컬럼 이름을 바꿀 때는 새 컬럼 추가 → 양쪽에 쓰는 코드 배포 → 옛 컬럼 삭제 순서로 진행합니다.
> 이렇게 하면 이전 버전 코드도 새 스키마에서 동작합니다.

### 실행 중인 컨테이너에 접속 (ECS Exec)

```bash
TASK=$(aws ecs list-tasks --cluster oven-note-prod --service-name oven-note-prod-web --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster oven-note-prod --task "$TASK" --container web --interactive --command "sh"
```

로컬에 Session Manager 플러그인이 있어야 합니다. 접속 기록은 CloudTrail에 남습니다.

### DB 백업과 복구 훈련 (분기마다 권장)

자동 백업은 7일간 보관되고, 그 기간 안의 어느 시점으로든 복구(PITR)할 수 있습니다.

1. RDS → `oven-note-prod-db` → Actions → **Restore to point in time** → 새 인스턴스 `oven-note-prod-db-restore-test`를 만듭니다.
2. 복구된 DB에 레시피가 있는지 확인합니다. 콘솔의 Query Editor를 쓰거나, Ops 태스크 정의를 복제해 host만 바꿔 실행합니다.
3. 확인이 끝나면 테스트 인스턴스를 **삭제**합니다(요금이 나옵니다).

실제 장애로 복구해야 할 때는 복구된 인스턴스를 만든 뒤 DB 모듈의 엔드포인트를 바꿔 apply하거나, 데이터만 덤프해서 옮깁니다.

### 관리자 비밀번호를 잊었을 때 / 로그인이 잠겼을 때

로그인 제한은 세 가지입니다. 같은 이메일+네트워크에서 15분에 5회, 한 네트워크에서 20회, 한 이메일 전체에 50회를 실패하면 막힙니다.
IPv6는 /64 단위로 셉니다. 다른 네트워크(예: 휴대폰 데이터)에서는 보통 계속 로그인할 수 있습니다.

1. 새 초기 비밀번호를 만듭니다: `terraform apply -replace=module.service.random_password.admin`
2. **Ops task → reset-admin-password**를 실행합니다. 비밀번호가 바뀌고, 모든 세션과 로그인 잠금이 해제됩니다.
3. 새 비밀번호를 확인합니다: `terraform output -raw admin_initial_password_command | bash`

### 레시피 수정이 사이트에 안 보일 때

- 저장할 때 앱이 CloudFront 무효화를 요청합니다. 로그에서 `cdn invalidation created`나 `failed`를 확인하세요.
- 실패했더라도 5분(`s-maxage=300`)이 지나면 자동으로 반영됩니다.
- 급하면 직접 비웁니다: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`

### 스케일 조정

`infra/terraform/envs/prod/terraform.tfvars`에서 조정합니다.

| 변수 | 의미 |
|---|---|
| `web_min_tasks` / `web_max_tasks` | 오토스케일링 범위 (기본 2~6) |
| `web_cpu` / `web_memory` | 태스크 크기 (512/1024) |
| `db_instance_class`, `db_multi_az` | DB 크기와 이중화 |

> 태스크 정의(환경 변수, CPU/메모리)를 바꾸는 apply 뒤에는 **Actions → Deploy를 한 번 실행**해야 실행 중인 태스크에 반영됩니다.
> 오토스케일링 범위처럼 서비스 설정만 바꾸는 경우는 apply만으로 바로 적용됩니다.

큰 행사(예: 학교 공지 링크)처럼 트래픽이 몰릴 게 예상되면, 하루 전에 `web_min_tasks`를 4로 올려 두세요.

### 의존성과 보안 업데이트

- 매달 `pnpm outdated`로 확인하고, Next.js 보안 공지(nextjs.org/blog)를 구독하세요.
- 베이스 이미지(`node:24.x-alpine`)의 패치 버전을 올리고 다시 배포합니다.
- ECR이 push할 때 이미지를 스캔합니다. 콘솔 → ECR → 이미지 → Vulnerabilities에서 확인하세요.
