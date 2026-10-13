<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators.
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM.
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region".
- The user has a managed IAM experience, including managed service control policies (SCPs) and resource control policies (RCPs). IAM policies may still be needed to let services work with each other. For questions about SCPs or RCPs, refer to https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html.

### Constraints

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions.
- Create all Regional resources in the project's assigned Region.
- AWS WAF and CloudWatch Logs may be created in `us-east-1` only when global resources (such as a global WAF instance) require dependencies there. Prefer the selected Region otherwise. When inventorying resources, also check `us-east-1` for CloudWatch Logs or WAF resources.
- Do not create Lambda, API Gateway, or other Regional resources outside the project Region.
- Confirm the Region in AWS Settings > View all projects > Overview > Additional Info > Region. If it cannot be confirmed there, check `~/.aws/config`.
- Do not use Lambda@Edge or CloudFormation StackSets. Do not attempt cross-Region actions such as cross-Region replication, multi-Region KMS keys, or Route 53 cross-Region routing policies.
- CloudFront is global and may be used in `us-east-1`, for example pointing to a Lambda function URL or API Gateway in the project Region. Lambda and API Gateway themselves must remain in the project Region.
- Amazon Rekognition, Textract, Personalize, and App Runner have reduced availability in `eu-north-1`.
- Human access IAM permissions are managed by AWS. Do not assign roles to team members unless absolutely necessary.
- If operations that previously worked suddenly return Access Denied, ask about the project's spend limit and whether the project has been upgraded to the paid plan. Direct the user to AWS Settings > Billing for spend status. Only project owners can modify a spend limit.
- The user manages billing, spend limits, invoices, and payments in AWS Settings. Budgets and cost optimization are managed in AWS Billing and Cost Management.
- If an AWS service is unavailable, run `aws freetier get-account-plan-state`. For a `FREE` plan, check https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier; for a `PAID` plan, check https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan. If unsupported by either list, check https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services; the user may need to activate advanced features.
- Before starting an AWS task, check for a relevant AWS skill and prefer its guidance over general knowledge.
- When AWS resources have been successfully created, ask whether the user wants them kept or cleaned up to reduce cost.

### Help level: LOW

- Follow all constraints in this file.
- Execute the user's request without modification.
- Only ask clarifying questions when necessary to prevent a security vulnerability.
- Only flag security risks; do not suggest alternatives or improvements.
<!-- END AWS Agent Toolkit rules -->
