import {
  aws_elasticloadbalancingv2 as elbv2,
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_ecs_patterns as ecsPatterns,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_cloudwatch as cw,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { LogMetricAlarmFactory } from "./monitorings";

export interface SampleWebAppProps {
  /**
   * ECR上に予めプッシュしたDockerイメージ名。
   *
   * **タグ名やドメイン名は含めないこと(例 : イメージのURIが`123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/nginx:latest`であれば、`nginx`とだけ指定すること)**
   */
  webAppImageName: string;
  /**
   * WEBアプリケーション用のロググループに出力されるログメッセージに対する一連の監視ロジックを生成するファクトリ関数群
   */
  logMetricAlarmFactories: { [name: string]: LogMetricAlarmFactory };
}

export class SampleWebApp extends Construct {
  public readonly webappLogGroup: logs.ILogGroup;
  public readonly alarms: { [name: string]: cw.IAlarm } = {};
  public readonly ecsapp: ecsPatterns.ApplicationLoadBalancedFargateService;
  constructor(scope: Construct, id: string, props: SampleWebAppProps) {
    super(scope, id);

    // バリデーションチェック
    if (
      props.webAppImageName.includes("/") ||
      props.webAppImageName.includes(":")
    ) {
      throw Error(
        `webAppImageName : ${props.webAppImageName}にはタグ名やドメイン名は含めないこと。(例 : イメージのURIが"123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/nginx:latest"であれば、"nginx"とだけ指定すること)`
      );
    }

    // ALBとFargateの一連のリソース群を作成し、FargateタスクからCloudWatch Logsにログを収集する。
    this.webappLogGroup = new logs.LogGroup(this, "LogGroup", {});
    this.ecsapp = new ecsPatterns.ApplicationLoadBalancedFargateService(
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
              props.webAppImageName
            )
          ),
          logDriver: ecs.LogDrivers.awsLogs({
            logGroup: this.webappLogGroup,
            streamPrefix: "webapp",
          }),
        },
      }
    );

    // コンストラクト外から注入されたログ監視アラーム用ファクトリ関数をロググループに対して適用
    Object.entries(props.logMetricAlarmFactories).forEach(
      ([name, alarmFactory]) => {
        this.alarms[name] = alarmFactory(this.webappLogGroup);
      }
    );
  }
}
