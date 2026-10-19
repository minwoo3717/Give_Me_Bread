# Consumers (CloudFront VPC origin, ECS service) must not start before the
# listener exists; ECS rejects a target group that has no load balancer yet.
output "alb_arn" {
  value      = aws_lb.this.arn
  depends_on = [aws_lb_listener.http]
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "listener_arn" {
  value = aws_lb_listener.http.arn
}

output "target_group_arn" {
  value      = aws_lb_target_group.web.arn
  depends_on = [aws_lb_listener.http]
}

output "target_group_arn_suffix" {
  value = aws_lb_target_group.web.arn_suffix
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}
