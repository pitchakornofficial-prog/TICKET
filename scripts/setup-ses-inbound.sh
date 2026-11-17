#!/usr/bin/env bash
set -euo pipefail

# Setup script for TICKET Amazon SES Inbound Email Receiving (ap-southeast-1)
# Usage:
#   AWS_REGION=ap-southeast-1 \
#   SES_INBOUND_WEBHOOK_SECRET="<32+ char random secret>" \
#   ./scripts/setup-ses-inbound.sh
#
# Optional:
#   STACK_NAME=ticket-ses-inbound
#   WEBHOOK_BASE_URL=https://ticket.phatysd.me
#   RULE_SET_NAME=ticket-inbound-rules

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-ticket-ses-inbound}"
WEBHOOK_BASE_URL="${WEBHOOK_BASE_URL:-https://ticket.phatysd.me}"
RULE_SET_NAME="${RULE_SET_NAME:-ticket-inbound-rules}"
TEMPLATE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infra/aws/ticket-ses-inbound.json"

if [[ -z "${SES_INBOUND_WEBHOOK_SECRET:-}" ]]; then
  echo "Generating random SES_INBOUND_WEBHOOK_SECRET (do not commit or share)..."
  SES_INBOUND_WEBHOOK_SECRET="$(openssl rand -hex 32)"
fi

if [[ ${#SES_INBOUND_WEBHOOK_SECRET} -lt 32 ]]; then
  echo "Error: SES_INBOUND_WEBHOOK_SECRET must be at least 32 characters." >&2
  exit 1
fi

echo "1. Verifying AWS identity & SES domain verification for phatysd.me in ${AWS_REGION}..."
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "   AWS Account: ${ACCOUNT_ID}"

aws ses get-identity-verification-attributes \
  --region "${AWS_REGION}" \
  --identities phatysd.me \
  --output table

echo "2. Deploying CloudFormation stack '${STACK_NAME}' (S3 bucket + SNS topic + SES receipt rule)..."
aws cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameter-overrides "RuleSetName=${RULE_SET_NAME}"

BUCKET_NAME="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='InboundEmailBucketName'].OutputValue" \
  --output text)"

TOPIC_ARN="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='InboundEmailTopicArn'].OutputValue" \
  --output text)"

echo "   S3 Bucket : ${BUCKET_NAME}"
echo "   SNS Topic : ${TOPIC_ARN}"

echo "3. Checking active SES receipt rule set in ${AWS_REGION}..."
CURRENT_ACTIVE_RULE_SET="$(aws ses describe-active-receipt-rule-set \
  --region "${AWS_REGION}" \
  --query 'Metadata.Name' \
  --output text 2>/dev/null || true)"

if [[ -n "${CURRENT_ACTIVE_RULE_SET}" && "${CURRENT_ACTIVE_RULE_SET}" != "None" && "${CURRENT_ACTIVE_RULE_SET}" != "${RULE_SET_NAME}" ]]; then
  echo "   WARNING: Active rule set is currently '${CURRENT_ACTIVE_RULE_SET}'."
  echo "   Skipping automatic switch so existing rules are not disrupted."
  echo "   To activate '${RULE_SET_NAME}', run:"
  echo "     aws ses set-active-receipt-rule-set --region ${AWS_REGION} --rule-set-name ${RULE_SET_NAME}"
else
  aws ses set-active-receipt-rule-set \
    --region "${AWS_REGION}" \
    --rule-set-name "${RULE_SET_NAME}"
  echo "   Activated rule set: ${RULE_SET_NAME}"
fi

echo "4. Storing production SSM SecureString parameters under /ticket/production/..."
aws ssm put-parameter --region "${AWS_REGION}" --overwrite --type SecureString \
  --name "/ticket/production/SES_INBOUND_WEBHOOK_SECRET" \
  --value "${SES_INBOUND_WEBHOOK_SECRET}"
aws ssm put-parameter --region "${AWS_REGION}" --overwrite --type String \
  --name "/ticket/production/SES_INBOUND_SNS_TOPIC_ARN" \
  --value "${TOPIC_ARN}"
aws ssm put-parameter --region "${AWS_REGION}" --overwrite --type String \
  --name "/ticket/production/SES_INBOUND_S3_BUCKET" \
  --value "${BUCKET_NAME}"
aws ssm put-parameter --region "${AWS_REGION}" --overwrite --type String \
  --name "/ticket/production/SES_INBOUND_ALLOWED_RECIPIENTS" \
  --value "support@phatysd.me,organizer@phatysd.me,organizer-support@phatysd.me"

echo "5. Creating SNS HTTPS subscription to ${WEBHOOK_BASE_URL}/api/webhooks/ses-inbound..."
echo "   NOTE: Ensure ECS web service is deployed with the SSM env vars above before SNS confirms!"
aws sns subscribe \
  --region "${AWS_REGION}" \
  --topic-arn "${TOPIC_ARN}" \
  --protocol https \
  --notification-endpoint "${WEBHOOK_BASE_URL}/api/webhooks/ses-inbound?secret=${SES_INBOUND_WEBHOOK_SECRET}"

echo ""
echo "=== NEXT MANUAL STEPS ==="
echo "1) Cloudflare DNS (phatysd.me):"
echo "   Add MX record: Name=@ | Mail server=inbound-smtp.${AWS_REGION}.amazonaws.com | Priority=10 | TTL=Auto (DNS only)"
echo "   Ensure no conflicting MX records exist and Cloudflare WAF does not challenge POST /api/webhooks/ses-inbound."
echo "2) IAM Policy for SES_ACCESS_KEY_ID user (to read raw MIME from S3):"
echo "   Grant s3:GetObject on arn:aws:s3:::${BUCKET_NAME}/inbound/*"
echo "3) Wire SSM parameters into ECS WebTask definition & force new deployment:"
echo "   SES_INBOUND_WEBHOOK_SECRET, SES_INBOUND_SNS_TOPIC_ARN, SES_INBOUND_S3_BUCKET, SES_INBOUND_ALLOWED_RECIPIENTS, SES_REPLY_USE_MAILBOX_FROM=true"
echo "4) Verify SNS subscription is Confirmed:"
echo "   aws sns list-subscriptions-by-topic --region ${AWS_REGION} --topic-arn ${TOPIC_ARN}"
