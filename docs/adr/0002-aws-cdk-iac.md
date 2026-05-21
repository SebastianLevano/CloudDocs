# ADR 0002 — Use AWS CDK (TypeScript) for infrastructure

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

The backend lives entirely on AWS managed services (Lambda, API Gateway, S3,
EventBridge, SQS, Secrets Manager, CloudWatch). We need a way to describe and
version that infrastructure that is reproducible across environments and
reviewable in pull requests.

## Decision

Use **AWS CDK** with the TypeScript bindings.

Alternatives considered:

- **Serverless Framework** — mature but YAML-centric, weaker type safety, and
  the plugin ecosystem is a moving target.
- **AWS SAM** — official but limited expressiveness, no good answer for cross-
  stack constructs.
- **Terraform** — excellent multi-cloud option but adds an unrelated DSL (HCL)
  and a separate state-management story for a portfolio project that is
  AWS-only.

CDK keeps everything in TypeScript so the backend and the infrastructure share
typings (e.g., the same `HandlerName` enum can be used by both), unit tests can
exercise constructs, and IAM policies can be generated programmatically.

## Consequences

- ✅ One language across application and infrastructure.
- ✅ Unit-testable constructs.
- ⚠️ Requires CDK bootstrap per account/region (one-time setup).
- ⚠️ Heavier dependency surface than Serverless Framework — acceptable for the
  enterprise-feel the project is aiming for.
