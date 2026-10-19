#!/usr/bin/env bash
# Runs the "ops" task definition once on ECS Fargate and fails if the
# container exits non-zero. Used by .github/workflows/deploy.yml (migrations)
# and .github/workflows/ops.yml (seed, create-admin, ...).
#
#   scripts/ci/run-ops-task.sh <deploy-config.json> <node script> [args...]
#   scripts/ci/run-ops-task.sh deploy-config.json scripts/migrate.cjs
#
# Requires: aws CLI v2, jq. AWS credentials from the GitHub OIDC role.
set -euo pipefail

CONFIG_FILE="$1"; shift
SCRIPT="$1"; shift

cfg() { jq -r "$1" "$CONFIG_FILE"; }
CLUSTER=$(cfg .cluster)
FAMILY=$(cfg .opsTaskFamily)
LOG_GROUP=$(cfg .opsLogGroup)
SUBNETS=$(cfg '.subnets | join(",")')
SGS=$(cfg '.securityGroups | join(",")')

COMMAND_JSON=$(jq -cn --arg s "$SCRIPT" '["node", $s] + $ARGS.positional' --args -- "$@")
OVERRIDES=$(jq -cn --argjson cmd "$COMMAND_JSON" '{containerOverrides: [{name: "ops", command: $cmd}]}')

echo "Running ${COMMAND_JSON} with task definition ${FAMILY} on ${CLUSTER}"
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILY" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SGS}],assignPublicIp=ENABLED}" \
  --overrides "$OVERRIDES" \
  --started-by "github-actions" \
  --query 'tasks[0].taskArn' --output text)

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "::error::RunTask did not start a task"
  exit 1
fi
echo "Started $TASK_ARN"

# `aws ecs wait tasks-stopped` gives up after 10 minutes; plenty for these jobs.
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"

DESCRIBE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN")
EXIT_CODE=$(jq -r '.tasks[0].containers[] | select(.name == "ops") | .exitCode // "null"' <<<"$DESCRIBE")
STOP_REASON=$(jq -r '.tasks[0].stoppedReason // ""' <<<"$DESCRIBE")

TASK_ID="${TASK_ARN##*/}"
echo "---- logs ($LOG_GROUP, ops/ops/$TASK_ID) ----"
aws logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "ops/ops/${TASK_ID}" \
  --start-from-head \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || echo "(no logs yet)"
echo "--------------------------------------------"

if [[ "$EXIT_CODE" != "0" ]]; then
  echo "::error::ops task failed (exit code: ${EXIT_CODE}, reason: ${STOP_REASON})"
  exit 1
fi
echo "ops task finished successfully"
