import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';

export interface NetworkStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
}

/**
 * Network primitives stack.
 *
 * Intentionally empty for MVP: CloudDocs runs fully serverless (Lambda + API Gateway + S3 +
 * Neon over the public internet). No VPC means no NAT gateway cost ($32/mo) and faster cold
 * starts. The stack exists so when we eventually need a VPC (e.g. RDS Proxy, private subnets
 * for processing workers, or VPC endpoints), it slots into the existing dependency graph
 * without renumbering.
 */
export class NetworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    new cdk.CfnOutput(this, 'NetworkMode', {
      value: 'serverless-public-internet',
      description: 'No VPC in MVP. See stack docstring for rationale.',
    });
  }
}
