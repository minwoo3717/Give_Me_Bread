# Internal ALB in private subnets. It has no public address: the only way in
# is the CloudFront VPC origin (see modules/cdn), so the origin cannot be hit
# directly from the internet.

resource "aws_lb" "this" {
  name                       = "${var.name}-alb"
  internal                   = true
  load_balancer_type         = "application"
  security_groups            = [var.alb_security_group_id]
  subnets                    = var.private_subnet_ids
  idle_timeout               = 60
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  # Next.js drains in-flight requests on SIGTERM; 30s is plenty and keeps
  # deploys fast (default is 300s).
  deregistration_delay = 30

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
