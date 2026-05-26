import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';

export interface StorageStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
}

export class StorageStack extends cdk.Stack {
  readonly uploadsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { config } = props;
    const { transitionToIaDays, expireUnaccessedDays } = config.uploadsLifecycle;

    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      // Region in the name keeps the bucket globally unique even after a
      // recent destroy in another region (S3 reserves names for ~hours
      // post-deletion, blocking same-name recreation).
      bucketName: `${config.resourcePrefix}-uploads-${config.env.account}-${config.env.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // Emit S3 events to EventBridge so the Phase 4 ingest pipeline can react
      // to ObjectCreated without per-bucket notification wiring.
      eventBridgeEnabled: true,
      // dev only — protect prod once we get there.
      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.stage !== 'prod',
      lifecycleRules: [
        {
          id: 'tier-cold-storage',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(transitionToIaDays),
            },
          ],
          // Plan calls for expiring docs unaccessed > 90d, but S3 lifecycle can't filter on
          // last-access. Closest proxy: expire by age. We treat "age since upload" as the
          // signal in dev/staging; prod will swap in Intelligent-Tiering + access logs later.
          expiration: cdk.Duration.days(expireUnaccessedDays),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          // TODO Phase 6: tighten to actual frontend origin once we have a domain.
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: this.uploadsBucket.bucketName,
      exportName: `${config.resourcePrefix}-uploads-bucket-name`,
    });

    new cdk.CfnOutput(this, 'UploadsBucketArn', {
      value: this.uploadsBucket.bucketArn,
      exportName: `${config.resourcePrefix}-uploads-bucket-arn`,
    });
  }
}
