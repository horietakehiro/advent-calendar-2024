import {
  App,
  Duration,
  Stack,
  StackProps,
  aws_logs as logs,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwActions,
  aws_sns as sns,
  aws_sns_subscriptions as snsSubscriptions,
  aws_lambda_nodejs as lambdaNodejs,
  aws_iam as iam,
  Aspects,
} from "aws-cdk-lib";
import {
  AwsApiCall,
  ExpectedResult,
  IntegTest,
} from "@aws-cdk/integ-tests-alpha";
import {
  LogMetricAlarmFactories,
  LogMetricAlarmFactory,
  LogMetricAlarmFactoryProps,
} from "../../../../lib/constructs/02/monitorings";
import { Construct } from "constructs";
import { ApplyDestroyPolicyAspect } from "../../utils";
import { DescribeAlarmsCommandInput } from "@aws-sdk/client-cloudwatch";
import {
  GetLogEventsCommandInput,
  PutLogEventsCommandInput,
} from "@aws-sdk/client-cloudwatch-logs";
import path = require("path");

export interface SUTProps extends StackProps {
  alarmFactory: (props: LogMetricAlarmFactoryProps) => LogMetricAlarmFactory;
  alarmFactoryProps: LogMetricAlarmFactoryProps;
  logMessages: string[];
}
/**
 * ロググループ上のログメッセージに対する監視ロジックをテストするための一連のリソースを定義したスタック
 */
export class SUT extends Stack {
  public readonly subscriberLogGroup: logs.ILogGroup;
  public readonly testLogGroup: logs.ILogGroup;
  public readonly testLogStream: logs.ILogStream;
  public readonly alarm: cw.IAlarm;
  public readonly logMessages: string[];

  constructor(scope: Construct, id: string, props: SUTProps) {
    super(scope, id, props);

    // アラームメッセージがSNSトピック経由でサブスクライバまで発報されることを機械的に確認出来るよう、
    // テストではSNSトピックにアラーム受信用のLambda関数をサブスクライブする
    // Lambda関数はSNSトピック経由でアラームメッセージを受信し、テスト用のロググループに受信したメッセージを出力する。
    // テストではそのロググループにアラームメッセージが出力されていることを確認する
    this.subscriberLogGroup = new logs.LogGroup(this, "SubscrinerLogGroup", {});
    const subscriberFunction = new lambdaNodejs.NodejsFunction(
      this,
      "SubscriberFunction",
      {
        entry: path.join(__dirname, "alarm-subscriber.ts"),
        handler: "index.handler",
        timeout: Duration.seconds(30),
        environment: {
          LOG_GROUP_NAME: this.subscriberLogGroup.logGroupName,
        },
      }
    );
    subscriberFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:PutLogEvents"],
        resources: [`${this.subscriberLogGroup.logGroupArn}:*`],
      })
    );
    const topic = new sns.Topic(this, "Topic", {});
    topic.addSubscription(
      new snsSubscriptions.LambdaSubscription(subscriberFunction)
    );
    const snsAction = new cwActions.SnsAction(topic);

    // 試験対象となるアラームの設定
    // テスト用のログメッセージを書き込むためのロググループとログストリームを作成
    this.testLogGroup = new logs.LogGroup(this, "LogGroup", {});
    this.testLogStream = new logs.LogStream(this, "LogStream", {
      logGroup: this.testLogGroup,
    });

    // テスト対象のアラームを作成
    const alarm = props.alarmFactory({
      ...props.alarmFactoryProps,
      actions: [snsAction],
    })(this.testLogGroup);
    // アラーム名ごとにアラームメッセージサブスクライバ用のログストリームも作成
    new logs.LogStream(this, "SubscrinerLogStream", {
      logGroup: this.subscriberLogGroup,
      logStreamName: alarm.alarmName,
    });
    // 作成されたアラームを後続のテストケース作成処理で参照する
    this.alarm = alarm;
    this.logMessages = props.logMessages;

    Aspects.of(this).add(new ApplyDestroyPolicyAspect());
  }
}

/**
 * テスト対象のスタックに対する一連のテストケースを作成する(内容自体はリファクタリング前と同じ)
 */
export const buildTestcase = (sut: SUT, integ: IntegTest) => {
  // 試験によってアラームが確実に発報されるよう、
  // 試験対象のアラームがアラーム状態でないことを事前に確認する
  const arrange = integ.assertions
    .awsApiCall("@aws-sdk/client-cloudwatch", "DescribeAlarms", {
      AlarmNames: [sut.alarm.alarmName],
    } as DescribeAlarmsCommandInput)
    .assertAtPath(
      "MetricAlarms.0.StateValue",
      ExpectedResult.stringLikeRegexp("^(?!ALARM).*$")
    );
  arrange.provider.addToRolePolicy({
    Effect: "Allow",
    Action: ["cloudwatch:DescribeAlarms"],
    Resource: [sut.alarm.alarmArn],
  });

  // アラームがトリガーされるようにログメッセージを作成する
  const act = integ.assertions.awsApiCall(
    "@aws-sdk/client-cloudwatch-logs",
    "PutLogEvents",
    {
      logGroupName: sut.testLogGroup.logGroupName,
      logStreamName: sut.testLogStream.logStreamName,
      logEvents: sut.logMessages.map((message) => {
        return { timestamp: new Date().getTime(), message };
      }),
    } as PutLogEventsCommandInput
  );
  act.provider.addToRolePolicy({
    Effect: "Allow",
    Action: ["logs:PutLogEvents"],
    Resource: [`${sut.testLogGroup.logGroupArn}:*`],
  });

  // アラームが期待通りにアラーム受信用のロググループに出力されていることを確認する。
  const assertions = integ.assertions
    .awsApiCall("@aws-sdk/client-cloudwatch-logs", "GetLogEvents", {
      logGroupName: sut.subscriberLogGroup.logGroupName,
      logStreamName: sut.alarm.alarmName,
      limit: 1,
      startTime: new Date().getTime(),
    } as GetLogEventsCommandInput)
    .assertAtPath(
      "events.0.message.Records.0.Sns.Message",
      ExpectedResult.objectLike({ AlarmName: sut.alarm.alarmName })
    )
    .waitForAssertions({
      interval: Duration.seconds(30),
      totalTimeout: Duration.minutes(5),
    });
  (assertions as AwsApiCall).waiterProvider?.addToRolePolicy({
    Effect: "Allow",
    Action: ["logs:GetLogEvents"],
    Resource: [`${sut.subscriberLogGroup.logGroupArn}:*`],
  });

  // arrange -> act -> assertionの順で処理が実行されるように設定
  arrange.next(act).next(assertions);
};

const app = new App();
const suts = [
  new SUT(app, "sut-cse-rate-alarm", {
    alarmFactory: LogMetricAlarmFactories.cseRateAlarmFactory,
    alarmFactoryProps: {
      actions: [], // スタック内でSNSトピックが設定される
      period: Duration.minutes(1),
      threshold: 10,
    },
    logMessages: [
      '192.168.0.1 - - [31/Dec/2024:00:00:00 +0000] "GET / HTTP/1.1" 400 100 "-" "curl" "-"',
      '192.168.0.1 - - [31/Dec/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 100 "-" "curl" "-"',
    ],
  }),
  new SUT(app, "sut-sse-rate-alarm", {
    alarmFactory: LogMetricAlarmFactories.sseRateAlarmFactory,
    alarmFactoryProps: {
      actions: [], // スタック内でSNSトピックが設定される
      period: Duration.minutes(1),
      threshold: 10,
    },
    logMessages: [
      '192.168.0.1 - - [31/Dec/2024:00:00:00 +0000] "GET / HTTP/1.1" 500 100 "-" "curl" "-"',
      '192.168.0.1 - - [31/Dec/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 100 "-" "curl" "-"',
    ],
  }),
];

const integ = new IntegTest(app, `test-log-metric-alarm`, {
  testCases: suts,
  cdkCommandOptions: {
    deploy: {
      args: {
        // テスト対象の複数のスタックが並列にデプロイされるよう指定
        concurrency: suts.length,
      },
    },
  },
});
suts.forEach((sut) => buildTestcase(sut, integ));
