import type { Environment } from 'aws-cdk-lib';

export type Stage = 'dev' | 'staging' | 'prod';

export interface InfraConfig {
  readonly stage: Stage;
  readonly env: Required<Environment>;
  readonly resourcePrefix: string;
  readonly alertEmail: string;
  /** Browser origins allowed by the API CORS policy (credentials require exact origins). */
  readonly webOrigins: string[];
  readonly billingAlarmUsd: number;
  readonly uploadsLifecycle: {
    readonly transitionToIaDays: number;
    readonly expireUnaccessedDays: number;
  };
  readonly customDomain: {
    readonly enabled: false;
    readonly name?: string;
  };
}

const STAGE_DEFAULTS: Record<Stage, Pick<InfraConfig, 'billingAlarmUsd' | 'uploadsLifecycle'>> = {
  dev: {
    billingAlarmUsd: 5,
    uploadsLifecycle: { transitionToIaDays: 30, expireUnaccessedDays: 90 },
  },
  staging: {
    billingAlarmUsd: 20,
    uploadsLifecycle: { transitionToIaDays: 30, expireUnaccessedDays: 180 },
  },
  prod: {
    billingAlarmUsd: 50,
    uploadsLifecycle: { transitionToIaDays: 60, expireUnaccessedDays: 365 },
  },
};

export function loadConfig(stageInput?: string): InfraConfig {
  const stage = parseStage(stageInput);
  const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;
  // sa-east-1 colocates compute with the Neon free-tier project (also sa-east-1).
  // Observability stack stays pinned to us-east-1 (see bin/clouddocs.ts) because
  // AWS publishes the EstimatedCharges billing metric there only.
  const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'sa-east-1';

  if (!account) {
    throw new Error(
      'AWS account id missing. Run via cdk with AWS credentials in scope, or set AWS_ACCOUNT_ID.',
    );
  }

  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail) {
    throw new Error(
      'ALERT_EMAIL not set. Required for the billing alarm SNS subscription (Phase 1 day-1 safety).',
    );
  }

  const stageDefaults = STAGE_DEFAULTS[stage];

  // Dev server origin is always allowed; the deployed frontend origin (Vercel)
  // is supplied via WEB_ORIGIN at deploy time so we never hardcode it.
  const webOrigins = ['http://localhost:4200'];
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  if (webOrigin && !webOrigins.includes(webOrigin)) webOrigins.push(webOrigin);

  return {
    stage,
    env: { account, region },
    resourcePrefix: `clouddocs-${stage}`,
    alertEmail,
    webOrigins,
    billingAlarmUsd: stageDefaults.billingAlarmUsd,
    uploadsLifecycle: stageDefaults.uploadsLifecycle,
    customDomain: { enabled: false },
  };
}

function parseStage(raw: string | undefined): Stage {
  const value = raw ?? 'dev';
  if (value === 'dev' || value === 'staging' || value === 'prod') return value;
  throw new Error(`Invalid stage "${value}". Allowed: dev | staging | prod.`);
}
