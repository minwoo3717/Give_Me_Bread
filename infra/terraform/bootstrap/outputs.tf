output "state_bucket" {
  description = "Pass to `terraform init -backend-config=\"bucket=...\"` in envs/prod."
  value       = aws_s3_bucket.tfstate.bucket
}

output "next_step" {
  value = "cd ../envs/prod && terraform init -backend-config=\"bucket=${aws_s3_bucket.tfstate.bucket}\""
}
