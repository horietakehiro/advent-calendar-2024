import {
  aws_cloudwatch_actions as cwActions,
  aws_sns as sns,
  Duration,
  Stack,
  StackProps,
  CfnOutput,
  aws_sns_subscriptions as snsSubscriptions,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { SampleWebApp } from "../constructs/02/sample-web-app";
import { LogMetricAlarmFactories } from "../constructs/02/monitorings";

export interface SampleWebAppStackProps extends StackProps {
  emailAddress: string;
}
export class SampleWebAppStack extends Stack {
  public readonly endpointURL: CfnOutput;
  constructor(scope: Construct, id: string, props: SampleWebAppStackProps) {
    super(scope, id, props);
    const topic = new sns.Topic(this, "Topic");
    topic.addSubscription(
      new snsSubscriptions.EmailSubscription(props.emailAddress)
    );
    const snsAction = new cwActions.SnsAction(topic);
    const app = new SampleWebApp(this, "ECSAPP", {
      logMetricAlarmFactories: {
        cseRateAlarm: LogMetricAlarmFactories.cseRateAlarmFactory({
          period: Duration.minutes(15),
          threshold: 25,
          actions: [snsAction],
        }),
        sseRateAlarm: LogMetricAlarmFactories.sseRateAlarmFactory({
          period: Duration.minutes(1),
          threshold: 5,
          actions: [snsAction],
        }),
      },
      webAppImageName: "nginx",
    });
    this.endpointURL = new CfnOutput(this, "EndpointURL", {
      value: `http://${app.ecsapp.loadBalancer.loadBalancerDnsName}`,
    });
  }
}
