import {
  aws_elasticloadbalancingv2 as elbv2,
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_ecs_patterns as ecsPatterns,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_cloudwatch as cw,
  aws_sns as sns,
  Duration,
  aws_cloudwatch_actions as cwActions,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface SampleWebAppProps {
  /**
   * ECR上に予め用意したDockerイメージ名。
   * 
   * **タグ名やドメイン名は含めないこと(例 : イメージのURIが`123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/nginx:latest`であれば、`nginx`とだけ指定すること)**
   */
  webAppImageName: string;
  /**
   * CloudWatchアラームの発報先となるSNSトピック
   */
  topic: sns.ITopic;
}

export class SampleWebApp extends Construct {
  public readonly webappLogGroup: logs.ILogGroup;
  public readonly alarms: { [name: string]: cw.IAlarm } = {};
  constructor(scope: Construct, id: string, props: SampleWebAppProps) {
    super(scope, id);

    // バリデーションチェック
    if (props.webAppImageName.includes("/") || props.webAppImageName.includes(":")) {
      throw Error(`webAppImageName : ${props.webAppImageName}にはタグ名やドメイン名は含めないこと。(例 : イメージのURIが"123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/nginx:latest"であれば、"nginx"とだけ指定すること)`)
    }

    // L3コンストラクトを使用してVPCとALB、Fargateの一連のリソース群を作成する
    // CloudWatch Logsのみコンストラクト外から注入する
    this.webappLogGroup = new logs.LogGroup(this, "LogGroup", {});
    const albecs = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "albecs",
      {
        listenerPort: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        openListener: true,
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 2,
        taskImageOptions: {
          containerName: "webapp",
          image: ecs.EcrImage.fromEcrRepository(
            ecr.Repository.fromRepositoryName(
              this,
              "WebAppRepository",
              props.webAppImageName,
            ),
          ),
          logDriver: ecs.LogDrivers.awsLogs({
            logGroup: this.webappLogGroup,
            streamPrefix: "webapp",
          }),
        },
      },
    );

    /**
     * 以下、CloudWatch Logsに収集されたログに対してメトリクスフィルターとアラームを設定し、
     * アラームアクションとしてSNSトピックにメッセージを発報する。
     */

    // 受信した全てのリクエスト数をログからカウントするメトリクス
    // ※ALBからのヘルスチェックリクエストは除外する
    const allRequestCount = this.webappLogGroup
      .addMetricFilter("AllRequestCount", {
        filterPattern: {
          logPatternString:
          '[..., agent != "ELB-HealthChecker*", xForwardedFor]',
        },
        metricName: "AllRequestCount",
        metricNamespace: "WebApp",
        defaultValue: 0,
        metricValue: "1",
        unit: cw.Unit.COUNT,
      })
      .metric({
        period: Duration.minutes(1),
        statistic: "sum",
        unit: cw.Unit.COUNT,
      });
    // クライアントサイドエラー(4xx)となったリクエスト数をログからカウントするメトリクス
    const cseRequestCount = this.webappLogGroup
      .addMetricFilter("CSERequestCount", {
        filterPattern: {
          logPatternString:
            '[..., status_code = 4*, bytes, referer, agent != "ELB-HealthChecker*", xForwardedFor]',
        },
        metricName: "CSERequestCount",
        metricNamespace: "WebApp",
        defaultValue: 0,
        metricValue: "1",
        unit: cw.Unit.COUNT,
      })
      .metric({
        period: Duration.minutes(1),
        statistic: "sum",
        unit: cw.Unit.COUNT,
      });
    // 10分間におけるクライアントサイドエラー率が25%以上の場合に
    // アラーム状態となりSNSトピックにメッセージを発報するアラーム
    const cseRateAlarm = new cw.Alarm(this, "cseRateAlrm", {
      evaluationPeriods: 1,
      threshold: 25,
      comparisonOperator:
        cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      actionsEnabled: true,
      metric: new cw.MathExpression({
        expression: "(cse / (all+0.01)) * 100",
        usingMetrics: {
          cse: cseRequestCount,
          all: allRequestCount,
        },
        period: Duration.minutes(10),
      }),
    });
    cseRateAlarm.addAlarmAction(new cwActions.SnsAction(props.topic));
    this.alarms["cseRate"] = cseRateAlarm;

    // サーバーサイドエラー(4xx)となったリクエスト数をログからカウントするメトリクス
    const sseRequestCount = this.webappLogGroup
      .addMetricFilter("SSERequestCount", {
        filterPattern: {
          logPatternString:
            '[..., status_code = 5*, bytes, referer, agent != "ELB-HealthChecker*", xForwardedFor]',
        },
        metricName: "CSERequestCount",
        metricNamespace: "WebApp",
        defaultValue: 0,
        metricValue: "1",
        unit: cw.Unit.COUNT,
      })
      .metric({
        period: Duration.minutes(1),
        statistic: "sum",
        unit: cw.Unit.COUNT,
      });

    // 1分間におけるサーバーサイドエラー率が10%以上の場合に
    // アラーム状態となりSNSトピックにメッセージを発報するアラーム
    const sseRateAlarm = new cw.Alarm(this, "SSERateAlrm", {
      evaluationPeriods: 1,
      threshold: 10,
      comparisonOperator:
        cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      actionsEnabled: true,
      metric: new cw.MathExpression({
        expression: "(sse / (all+0.01)) * 100",
        usingMetrics: {
          sse: sseRequestCount,
          all: allRequestCount,
        },
        period: Duration.minutes(1),
      }),
    });
    sseRateAlarm.addAlarmAction(new cwActions.SnsAction(props.topic));
    this.alarms["sseRate"] = sseRateAlarm;
  }
}
