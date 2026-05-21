import * as cdk from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { InfraConfig } from '../config';

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly config: InfraConfig;
}

/**
 * Day-1 cost safety net. AWS publishes EstimatedCharges only in us-east-1, every ~6 h, and
 * only after Billing > Preferences > "Receive Billing Alerts" is enabled in the root account.
 * The plan calls for a $5 alarm in dev so we get paged the moment we touch a non-free-tier
 * service unexpectedly.
 */
export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { config } = props;

    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `${config.resourcePrefix}-alerts`,
      displayName: `CloudDocs ${config.stage} alerts`,
    });

    alertsTopic.addSubscription(new snsSubs.EmailSubscription(config.alertEmail));

    const estimatedCharges = new cw.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: { Currency: 'USD' },
      statistic: 'Maximum',
      // Billing metric updates ~every 6 hours; 6-hour period matches publish cadence.
      period: cdk.Duration.hours(6),
    });

    const billingAlarm = new cw.Alarm(this, 'BillingAlarm', {
      alarmName: `${config.resourcePrefix}-billing-over-${config.billingAlarmUsd}usd`,
      alarmDescription:
        `Total estimated AWS charges crossed $${config.billingAlarmUsd} USD. ` +
        `If this fires in dev, investigate immediately — most CloudDocs services are free-tier.`,
      metric: estimatedCharges,
      threshold: config.billingAlarmUsd,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    billingAlarm.addAlarmAction(new cwActions.SnsAction(alertsTopic));

    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
      exportName: `${config.resourcePrefix}-alerts-topic-arn`,
    });

    new cdk.CfnOutput(this, 'BillingAlarmName', {
      value: billingAlarm.alarmName,
      description:
        'Confirm the subscription email is verified, then visit Billing → Preferences → Receive Billing Alerts in the root account if the alarm shows INSUFFICIENT_DATA forever.',
    });
  }
}
