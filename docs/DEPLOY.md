# 배포 가이드 (처음부터 실서비스까지)

이 문서를 위에서부터 순서대로 따라 하면 빈 AWS 계정에서 `https://xxxx.cloudfront.net`으로 접속되는 실서비스까지 만들 수 있습니다.
각 단계에 **[직접]** 표시가 있으면 사람이 콘솔이나 브라우저에서 해야 하는 일입니다.

전체 소요: 처음이면 약 2시간입니다. 그중 Terraform 첫 apply가 20~30분 걸립니다.

---

## 0. 준비물

| 항목 | 설치/확인 |
|---|---|
| Node.js 24 LTS (24.18.1 이상) | `node -v`. 24.16은 보안 패치 전 버전이라 업데이트를 권장합니다 |
| pnpm 11 | `corepack enable pnpm` 또는 `npm i -g pnpm@11.5.0` |
| Git, GitHub 계정 | |
| AWS CLI v2 | `winget install Amazon.AWSCLI` |
| Terraform 1.16 | `winget install Hashicorp.Terraform` |
| (선택) Docker Desktop | 로컬에서 운영 이미지를 그대로 띄워 볼 때만 필요합니다. 배포 이미지는 GitHub Actions가 빌드합니다 |

### 프로젝트 위치 (권장)

지금 폴더 `OneDrive\바탕 화면\free`에는 두 가지 문제가 있습니다.

1. 로컬 Postgres의 `initdb`가 **한글 경로에서 실패합니다**. 실제로 겪은 문제이며, `scripts/dev-db.ts`는 이를 피하려고 DB 파일을 `%LOCALAPPDATA%\oven-note`에 둡니다.
2. OneDrive가 `node_modules`와 `.next`에 있는 수만 개 파일을 계속 동기화해 느려지고, 파일 잠금이 생길 수 있습니다.

영문 경로로 옮기는 것을 권장합니다.

```powershell
git clone https://github.com/minwoo3717/Give_Me_Bread.git C:\dev\Give_Me_Bread
cd C:\dev\Give_Me_Bread
pnpm install
copy .env.example .env.local
```

---

## 1. AWS 계정 준비 [직접]

1. AWS 계정을 만듭니다. 가입할 때 **유료(Paid) 플랜**을 고르세요.
   - 무료 플랜은 6개월이 지나거나 크레딧($100~200)을 다 쓰면 계정이 닫히고, 90일 뒤 데이터가 삭제됩니다.
   - 이 구성은 트래픽에 따라 한 달에 약 $100~200이 들어서, 크레딧이 1~2개월이면 소진됩니다.
2. 루트 계정에 **MFA**를 켭니다.
3. IAM Identity Center(또는 IAM 사용자)로 관리자 사용자를 만들고, 루트 계정은 쓰지 않습니다.
4. 로컬에서 인증합니다. `aws configure sso`가 기본 리전을 물으면 **ap-northeast-2**를 입력하세요.
   ```bash
   aws configure sso                 # Identity Center인 경우. 프로필 이름 예: oven-admin
   export AWS_PROFILE=oven-admin     # PowerShell: $env:AWS_PROFILE = "oven-admin"
   aws sts get-caller-identity
   ```
   이후 모든 `terraform`·`aws` 명령은 이 프로필이 설정된 터미널에서 실행합니다.
5. 리전은 **ap-northeast-2 (서울)**입니다.

> 예산 알림은 Terraform이 만듭니다(`monthly_budget_usd`, 기본 $150).
> 크레딧을 빼고 계산하므로, 가입 크레딧이 남아 있어도 실제 사용량 기준으로 알림이 옵니다.

---

## 2. GitHub 저장소 [직접]

1. 저장소는 [minwoo3717/Give_Me_Bread](https://github.com/minwoo3717/Give_Me_Bread)입니다(공개, 기본 브랜치 `master`).
   코드는 이미 올라가 있으므로, 다른 PC에서 작업할 때는 clone해서 씁니다.
   ```bash
   git clone https://github.com/minwoo3717/Give_Me_Bread.git C:\dev\Give_Me_Bread
   ```
2. `master`에 push할 때마다 `Deploy` 워크플로가 돕니다. AWS를 연결하기 전(5단계 전)에는 CI만 통과하고 배포 단계는 실패합니다. 정상입니다.
3. **Settings → Environments → New environment → `production`**을 만들고 다음을 설정합니다(**보안상 필수**).
   - **Deployment branches and tags → Selected branches → `master`**만 허용합니다. 다른 브랜치의 코드는 AWS 배포 권한을 얻지 못합니다.
   - (권장) **Required reviewers**에 본인을 넣으면, 배포 전에 승인 버튼을 눌러야 진행됩니다.
4. **Settings → Actions → General → Fork pull request workflows**에서 외부 기여자의 워크플로 실행에 승인이 필요하도록 둡니다(기본값 유지).
5. 저장소의 숫자 ID는 Terraform 예시 파일에 이미 넣어 두었습니다(`github_owner_id = "68678017"`, `github_repository_id = "1425838536"`).
   이 저장소는 2026년 7월 15일 이후에 만들어서, GitHub OIDC 토큰에 이 ID가 들어갑니다.
   값은 `https://api.github.com/repos/minwoo3717/Give_Me_Bread`의 `owner.id`, `id`와 같습니다.

> **ARM 러너**: 배포 워크플로는 `ubuntu-24.04-arm` 러너에서 arm64 이미지를 빌드합니다(Fargate Graviton이 약 20% 저렴합니다).
> 공개 저장소는 ARM 러너를 무료로 쓸 수 있습니다. 저장소를 비공개로 바꿔 ARM 러너를 쓸 수 없게 되면 `production` 환경의 변수로 `BUILD_RUNNER=ubuntu-latest`, `BUILD_PLATFORM=linux/amd64`를 넣고,
> Terraform 변수 `cpu_architecture = "X86_64"`로 바꾸세요.

---

## 3. Terraform 부트스트랩 (1회)

상태 저장용 S3 버킷과 GitHub OIDC 공급자를 만듭니다.

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

출력되는 `state_bucket` 값을 메모하세요. 이 폴더에 생기는 `terraform.tfstate`는 git에 올라가지 않으니 안전한 곳에 백업하세요.

> 계정에 이미 GitHub OIDC 공급자가 있으면 `terraform apply -var create_github_oidc_provider=false`로 실행합니다.

---

## 4. 운영 인프라 생성

```bash
cd ../envs/prod
cp terraform.tfvars.example terraform.tfvars   # github_repository, alarm_email, admin_email, github_owner_id, github_repository_id 입력
terraform init -backend-config="bucket=<state_bucket 값>"
terraform plan
terraform apply
```

- 생성되는 것: VPC, 내부 ALB, CloudFront(+VPC 오리진, WAF), RDS PostgreSQL 18, ECR, ECS 클러스터와 서비스, 알람, 대시보드, 예산, GitHub 배포 역할.
- **CloudFront VPC 오리진은 만드는 데 최대 15분**이 걸립니다. RDS도 10분 정도 걸립니다.
- 첫 apply 직후에는 ECS 서비스가 아직 없는 이미지(`:bootstrap`)를 가리킵니다. 그래서 태스크가 계속 시작에 실패하고 `healthy-hosts-low` 알람이 울립니다. **정상이며**, 첫 배포(6단계)가 끝나면 사라집니다.

출력값에서 다음을 확인합니다.

| 출력 | 용도 |
|---|---|
| `site_url` | 서비스 주소 (`https://dxxxx.cloudfront.net`) |
| `github_deploy_role_arn` | 다음 단계에서 GitHub에 넣을 값 |
| `admin_initial_password_command` | 관리자 초기 비밀번호를 확인하는 명령 |
| `dashboard_url` | CloudWatch 대시보드 |

**[직접]** `alarm_email`로 온 **"AWS Notification - Subscription Confirmation"** 메일에서 Confirm을 누르세요. 누르지 않으면 알람 메일이 오지 않습니다.

---

## 5. GitHub에 AWS 연결 [직접]

저장소 **Settings → Environments → production → Environment variables**에 다음을 추가합니다.

| 이름 | 값 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |

AWS 액세스 키는 어디에도 저장하지 않습니다. GitHub Actions가 OIDC로 이 역할을 잠깐 빌려 씁니다.
이 역할은 `production` 환경에서 도는 잡만 쓸 수 있습니다.

(권장) 같은 화면의 **Environment secrets**에 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`를 추가합니다.
이 키는 빌드 결과물(이미지와 GitHub Actions 빌드 캐시)에 들어가므로 비밀번호가 아니라 고정된 소금(salt) 정도로 생각하세요.
값은 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`로 만듭니다.
이 키가 빌드마다 같으면, 배포 직전에 열어 둔 관리자 화면에서도 저장이 계속 됩니다.
없으면 배포 직후 관리자 화면을 한 번 새로고침해야 할 수 있습니다.

---

## 6. 첫 배포

**Actions → Deploy → Run workflow**에서 **seed에 체크**하고 실행합니다(첫 배포에서만). 휘낭시에 레시피가 함께 들어갑니다.
이후에는 `master`에 push하면 CI를 거쳐 자동으로 배포됩니다. Pull Request에서는 CI만 돕니다.

파이프라인 순서는 다음과 같습니다.

1. CI: 린트, 타입 검사, 테스트, 빌드, 스모크 테스트
2. arm64 이미지 빌드 → ECR에 push (태그는 git SHA. 같은 커밋을 다시 배포하면 기존 이미지를 재사용)
3. `/_next/static`을 S3에 업로드 (이전 버전 파일도 지우지 않고 남겨 둠)
4. DB 마이그레이션 (VPC 안에서 일회성 ECS 태스크로 실행. `app_user` 권한도 이때 설정)
5. 웹 서비스 롤링 배포. 새 태스크가 헬스체크를 통과해야 기존 태스크를 내리고, 실패하면 자동으로 롤백합니다
6. 배포된 이미지 태그를 SSM에 기록 → CloudFront 캐시 비우기 → 운영 URL 스모크 테스트

## 7. 관리자 계정

**Actions → Ops task → Run workflow**에서 `create-admin`을 실행합니다. `admin_email`로 관리자 계정이 만들어집니다.
(첫 배포에서 seed를 빠뜨렸다면 `seed`도 한 번 실행하세요. 이미 있는 레시피는 건너뜁니다.)

초기 비밀번호를 확인합니다.

```bash
cd infra/terraform/envs/prod
terraform output -raw admin_initial_password_command | bash   # PowerShell: Invoke-Expression (terraform output -raw admin_initial_password_command)
```

`<site_url>/admin`에 로그인한 뒤 **계정 → 비밀번호 변경**에서 바로 바꾸세요.

## 8. 확인

```bash
node scripts/smoke.mjs https://dxxxx.cloudfront.net
```

- 대시보드(`dashboard_url`)에서 요청 수, 지연, 태스크 수가 보이는지 확인합니다.
- 관리자에서 레시피 요약을 한 글자 고치고 저장합니다. 공개 페이지에 1분 안에 반영되는지 확인합니다(CloudFront 무효화).
- 부하 테스트는 [loadtest/k6-recipes.js](../loadtest/k6-recipes.js)를 참고하세요. WAF IP 제한을 잠시 올려야 합니다.

---

## 비용 (서울 리전, 2026년 10월 가격, 월 기준)

| 항목 | 금액 |
|---|---|
| Fargate ARM 0.5vCPU/1GB × 2 | ~$33 |
| ALB (내부) | ~$22 |
| RDS db.t4g.micro 단일 AZ + 20GB gp3 | ~$21 |
| 태스크 공인 IPv4 × 2 | ~$7 |
| WAF (ACL 1개 + 규칙 5개 + 요청) | ~$10~15 |
| CloudFront | 월 1TB / 1천만 요청까지 무료. 하루 10만 PV면 ~$85 |
| CloudWatch 로그/알람, Secrets Manager, ECR | ~$4 |
| **합계** | **약 $100 (하루 3만 PV) ~ $200 (하루 10만 PV)**. 예산 알림 기본값은 $150 |

절약 방법:

- `enable_waf = false` (-$12)
- 연습 기간에는 `web_min_tasks = 1` (-$20). 대신 AZ 장애에 대비할 수 없습니다.

## 잠시 멈추기 / 완전히 지우기

- **멈추기**: ECS 서비스 태스크 수를 0으로 내리고(`aws ecs update-service --desired-count 0` + 오토스케일링 min 0), RDS를 정지합니다.
  RDS는 최대 7일 동안만 정지되고 그 뒤 자동으로 다시 켜집니다. ALB와 WAF 요금은 계속 나옵니다.
- **지우기**: `terraform.tfvars`에 `deletion_protection = false`를 넣고 `apply`한 다음 `terraform destroy`를 실행합니다.
  이 설정이 꺼지면 S3 정적 파일 버킷과 ECR 이미지도 함께 지워집니다.
  RDS 최종 스냅샷(`oven-note-prod-db-final`)은 남으니, 필요 없으면 콘솔에서 지우세요.

## 나중에: 내 도메인 붙이기

1. Route 53(또는 가비아 등)에서 도메인을 삽니다.
2. **us-east-1** 리전 ACM에서 인증서를 발급합니다(DNS 검증).
3. `terraform.tfvars`에 `domain_aliases = ["recipes.example.com"]`, `acm_certificate_arn = "arn:aws:acm:us-east-1:..."`를 넣고 apply합니다.
   그러면 TLS 1.2 이상이 강제되고, 태스크 정의의 `SITE_URL`이 새 도메인으로 바뀝니다.
   **apply 직후 Actions → Deploy를 한 번 실행해야** 실행 중인 서비스에 반영됩니다.
4. DNS에 CloudFront 별칭(ALIAS/CNAME) 레코드를 추가합니다.
5. (권장) ALB에 HTTPS 리스너와 인증서를 붙입니다. VPC 오리진은 사용 중에는 수정할 수 없으므로 두 단계로 바꿉니다.
   먼저 `https-only`로 설정한 **두 번째** `aws_cloudfront_vpc_origin`(다른 이름)을 만들고 배포가 그쪽을 가리키게 apply합니다.
   그다음 apply에서 기존 오리진을 지웁니다.

> 일반 규칙: 태스크 정의의 환경 변수를 바꾸는 `terraform apply`(도메인, DB 주소, `admin_email` 등)를 한 뒤에는 **Deploy를 한 번 실행**하세요.
