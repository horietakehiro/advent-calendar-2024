import {
  aws_logs as logs,
  aws_cloudwatch as cw,
  Duration,
  Stack,
} from "aws-cdk-lib";

export interface LogMetricAlarmFactoryProps {
  period: Duration;
  threshold: number;
  actions: cw.IAlarmAction[];
}
export type LogMetricAlarmFactory = (logGroup: logs.ILogGroup) => cw.IAlarm;
/**
 * ロググループにメトリクスフィルターとアラームを設定するファクトリ関数を集約するクラス
 */
export class LogMetricAlarmFactories {
  // 同一のロググループに複数回同一のメトリックを設定しないようにキャッシュする
  private static metricsByLogGroups: { [id: string]: cw.IMetric } = {};
  // 全リクエスト数を計上するメトリック
  private static allRequestCount(
    logGroup: logs.ILogGroup,
    props: LogMetricAlarmFactoryProps
  ): cw.IMetric {
    const key = `${logGroup.node.path}/AllRequestCount`;
    if (key in this.metricsByLogGroups) {
      return this.metricsByLogGroups[key];
    } else {
      const metric = logGroup
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
          period: props.period,
          statistic: "sum",
          unit: cw.Unit.COUNT,
        });
      this.metricsByLogGroups[key] = metric;
      return metric;
    }
  }
  /**
   * 全リクエストに占めるクライアントサイドエラー(4xx)の割合が一定閾値を超えたらアラームを発報する
   * @param props
   * @returns
   */
  static cseRateAlarmFactory(
    props: LogMetricAlarmFactoryProps
  ): LogMetricAlarmFactory {
    return (logGroup) => {
      const allRequestCount = LogMetricAlarmFactories.allRequestCount(
        logGroup,
        props
      );
      const cseCount = logGroup
        .addMetricFilter("CSECount", {
          filterPattern: {
            logPatternString:
              '[..., status_code = 4*, bytes, referer, agent != "ELB-HealthChecker*", xForwardedFor]',
          },
          metricName: "CSECount",
          metricNamespace: "WebApp",
          defaultValue: 0,
          metricValue: "1",
          unit: cw.Unit.COUNT,
        })
        .metric({
          period: props.period,
          statistic: "sum",
          unit: cw.Unit.COUNT,
        });
      const cseRateAlarm = new cw.Alarm(Stack.of(logGroup), "cseRateAlrm", {
        evaluationPeriods: 1,
        threshold: props.threshold,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        actionsEnabled: true,
        metric: new cw.MathExpression({
          expression: "(cse / (all+0.01)) * 100",
          usingMetrics: {
            cse: cseCount,
            all: allRequestCount,
          },
          period: props.period,
        }),
      });
      cseRateAlarm.addAlarmAction(...props.actions);
      return cseRateAlarm;
    };
  }
  /**
   * 全リクエストに占めるサーバーサイドエラー(5xx)の割合が一定閾値を超えたらアラームを発報する
   * @param props
   * @returns
   */
  static sseRateAlarmFactory(
    props: LogMetricAlarmFactoryProps
  ): LogMetricAlarmFactory {
    return (logGroup) => {
      const allRequestCount = LogMetricAlarmFactories.allRequestCount(
        logGroup,
        props
      );
      const sseCount = logGroup
        .addMetricFilter("SSECount", {
          filterPattern: {
            logPatternString:
              '[..., request, status_code = 5*, bytes, referer, agent != "ELB-HealthChecker*", xForwardedFor]',
          },
          metricName: "SSECount",
          metricNamespace: "WebApp",
          defaultValue: 0,
          metricValue: "1",
          unit: cw.Unit.COUNT,
        })
        .metric({
          period: props.period,
          statistic: "sum",
          unit: cw.Unit.COUNT,
        });

      const sseRateAlarm = new cw.Alarm(Stack.of(logGroup), "SSERateAlrm", {
        evaluationPeriods: 1,
        threshold: props.threshold,
        comparisonOperator:
          cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        actionsEnabled: true,
        metric: new cw.MathExpression({
          expression: "(sse / (all+0.01)) * 100",
          usingMetrics: {
            sse: sseCount,
            all: allRequestCount,
          },
          period: props.period,
        }),
      });
      sseRateAlarm.addAlarmAction(...props.actions);
      return sseRateAlarm;
    };
  }
}
