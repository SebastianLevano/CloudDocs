#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { ObservabilityStack } from '../lib/stacks/observability-stack';

const app = new cdk.App();

const stageInput = app.node.tryGetContext('stage') as string | undefined;
const config = loadConfig(stageInput);

const tags = {
  Project: 'CloudDocs',
  Stage: config.stage,
  ManagedBy: 'cdk',
};

const network = new NetworkStack(app, `${config.resourcePrefix}-network`, {
  env: config.env,
  description: 'Network primitives (currently empty — serverless). Placeholder for future VPC.',
  tags,
  config,
});

const storage = new StorageStack(app, `${config.resourcePrefix}-storage`, {
  env: config.env,
  description: 'S3 uploads bucket with lifecycle policy and CORS for browser presigned PUT.',
  tags,
  config,
});

const api = new ApiStack(app, `${config.resourcePrefix}-api`, {
  env: config.env,
  description: 'API Gateway HTTP v2 + auth/document Lambdas. Custom domain wired up in Phase 6.',
  tags,
  config,
  uploadsBucket: storage.uploadsBucket,
});

const observability = new ObservabilityStack(app, `${config.resourcePrefix}-observability`, {
  // Billing metrics only exist in us-east-1 — pin the stack there regardless of app region.
  env: { account: config.env.account, region: 'us-east-1' },
  description: 'CloudWatch billing alarm + SNS topic. Day-1 cost safety net.',
  tags,
  config,
  crossRegionReferences: true,
});

// Explicit cross-stack ordering for clarity. CDK would infer this from references but
// listing it here keeps the dependency graph readable.
api.addDependency(storage);
api.addDependency(network);
observability.addDependency(api);

app.synth();
