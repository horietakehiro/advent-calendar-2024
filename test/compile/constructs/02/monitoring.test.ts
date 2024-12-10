import {
    aws_cloudwatch_actions as cwActions,
    Duration,
    aws_logs as logs,
    Stack,
} from "aws-cdk-lib";
import {
    LogMetricAlarmFactories,
    LogMetricAlarmFactoryProps,
} from "../../../../lib/constructs/02/monitorings";
import {
    ExtraMatch,
    TypedTemplate,
} from "@horietakehiro/aws-cdk-utul/lib/assertions";
import {
    AWS_CLOUDWATCH_ALARM,
    AWS_LOGS_LOGGROUP,
    AWS_LOGS_METRICFILTER,
} from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";

describe("LogMetricAlarmFactories", () => {
  const alarmFactories = {
    cseRateAlarm: LogMetricAlarmFactories.cseRateAlarmFactory,
    sseRateAlarm: LogMetricAlarmFactories.sseRateAlarmFactory,
  };
  Object.entries(alarmFactories).forEach(([name, alarmFactory]) => {
    const stack = new Stack();
    const logGroup = new logs.LogGroup(stack, "LogGroup", {});
    const props: LogMetricAlarmFactoryProps = {
      period: Duration.minutes(30),
      threshold: 99,
      actions: [new cwActions.Ec2Action(cwActions.Ec2InstanceAction.REBOOT)],
    };
    alarmFactory(props)(logGroup);
    const template = TypedTemplate.fromStack(stack);
    test(`${name} - 引数で渡したロググループに対してメトリクスフィルターが設定されている`, () => {
      const { id } = template.getResource(AWS_LOGS_LOGGROUP());
      template.hasResource(
        AWS_LOGS_METRICFILTER({
          Properties: {
            LogGroupName: ExtraMatch.ref(id),
          },
        })
      );
    });
    test(`${name} - プロパティで指定した値がアラームの設定に使用されている`, () => {
      const alarm = template.getResource(AWS_CLOUDWATCH_ALARM());
      // 閾値
      expect(alarm.def.Properties?.Threshold).toBe(props.threshold);
      // ピリオド
      const metrics = alarm.def.Properties?.Metrics ?? [];
      expect(metrics.length).toBeGreaterThan(0);
      metrics.forEach((m) => {
        if (m.MetricStat) {
          expect(m.MetricStat.Period).toBe(props.period.toSeconds());
        }
      });
      // アラームアクション
      expect(
        JSON.stringify(alarm.def.Properties?.AlarmActions).includes(
          "ec2:reboot"
        )
      );
    });

    test(`${name} - スナップショットテスト`, () => {
      expect(template.template).toMatchSnapshot(name);
    });

    test("同一のロググループに複数種類のアラームを設定出来る", () => {
      const stack = new Stack();
      const logGroup = new logs.LogGroup(stack, "LogGroup");
      const props: LogMetricAlarmFactoryProps = {
        period: Duration.seconds(60),
        threshold: 99,
        actions: [new cwActions.Ec2Action(cwActions.Ec2InstanceAction.REBOOT)],
      };
      LogMetricAlarmFactories.cseRateAlarmFactory(props)(logGroup);
      LogMetricAlarmFactories.sseRateAlarmFactory(props)(logGroup);

      const template = TypedTemplate.fromStack(stack);
      const lg = template.getResource(AWS_LOGS_LOGGROUP());
      template.allResourcesProperties(
        AWS_LOGS_METRICFILTER({
          Properties: {
            LogGroupName: ExtraMatch.ref(lg.id),
          },
        })
      );
    });
  });
});
