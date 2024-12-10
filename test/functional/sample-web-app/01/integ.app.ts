import {
  App,
  aws_logs as logs,
  aws_sns,
  aws_sns_subscriptions,
  Stack,
  Aspects,
  Duration,
} from "aws-cdk-lib";
import { SampleWebApp } from "../../../../lib/constructs/01/sample-web-app";
import {
  AwsApiCall,
  ExpectedResult,
  IntegTest,
} from "@aws-cdk/integ-tests-alpha";
import { ApplyDestroyPolicyAspect } from "../../utils";
import { DescribeAlarmsCommandInput } from "@aws-sdk/client-cloudwatch";
import { PutLogEventsCommandInput } from "@aws-sdk/client-cloudwatch-logs";

const app = new App();
const stack = new Stack(app, "log-metric-alarm");
const topic = new aws_sns.Topic(stack, "Topic", {});
topic.addSubscription(
  // ダミーのEメールサブスクリプション
  new aws_sns_subscriptions.EmailSubscription("test@example.com")
);
const ecsapp = new SampleWebApp(stack, "ECSApp", {
  topic,
  webAppImageName: "nginx",
});
// テスト用のログメッセージを出力するためのログストリーム
const testLogStream = new logs.LogStream(stack, "LogStream", {
  logGroup: ecsapp.webappLogGroup,
});
// テスト用に作成したリソースが、テスト終了時に全て削除されるように削除ポリシーを一括適用
Aspects.of(stack).add(new ApplyDestroyPolicyAspect());

// テスト対象のロググループに書き込むログメッセージ(nginxログ)の雛形用ヘルパー関数
const logMessage = (code: string): string => {
  return `192.168.0.1 - - [31/Dec/2024:00:00:00 +0000] "GET / HTTP/1.1" ${code} 100 "-" "curl" "-"`;
};

/**
 * SampleWebAppコンストラクトで作成されたロググループ内にログメッセージを書き込み、
 * 期待通りアラームがSNSトピックに発報されることを確認する
 */
const integ = new IntegTest(app, "test-log-metric-alarm", {
  testCases: [stack],
});
// メトリックフィルターとアラームの種類ごと(今回は2種類)にテストケースの一連の処理を実装する
Object.values(ecsapp.alarms).forEach((alarm) => {
  // 試験によってアラームが確実に発報されるよう、
  // 試験対象のアラームがアラーム状態でないことを事前に確認する
  const arrange = integ.assertions
    .awsApiCall("@aws-sdk/client-cloudwatch", "DescribeAlarms", {
      AlarmNames: [alarm.alarmName],
    } as DescribeAlarmsCommandInput)
    .assertAtPath(
      "MetricAlarms.0.StateValue",
      ExpectedResult.stringLikeRegexp("^(?!ALARM).*$")
    );
  arrange.provider.addToRolePolicy({
    Effect: "Allow",
    Action: ["cloudwatch:DescribeAlarms"],
    Resource: ["*"],
  });

  // アラームの発報条件が満たされるように、
  // テスト用のログストリーム内にログメッセージを出力する
  const act = integ.assertions.awsApiCall(
    "@aws-sdk/client-cloudwatch-logs",
    "PutLogEvents",
    {
      logGroupName: ecsapp.webappLogGroup.logGroupName,
      logStreamName: testLogStream.logStreamName,
      logEvents: [
        {
          timestamp: new Date().getTime(),
          message: logMessage("200"),
        },
        {
          timestamp: new Date().getTime(),
          message: logMessage("500"),
        },
      ],
    } as PutLogEventsCommandInput
  );
  act.provider.addToRolePolicy({
    Effect: "Allow",
    Action: ["logs:PutLogEvents"],
    Resource: ["*"],
  });

  // ログメッセージを作成したことで、アラームが期待通りにアラーム状態に遷移することを確認する
  // ※30秒間隔で最大30分待機する
  const assertions = integ.assertions
    .awsApiCall("@aws-sdk/client-cloudwatch", "DescribeAlarms", {
      AlarmNames: [alarm.alarmName],
    } as DescribeAlarmsCommandInput)
    .assertAtPath(
      "MetricAlarms.0.StateValue",
      ExpectedResult.stringLikeRegexp("ALARM")
    )
    .waitForAssertions({
      interval: Duration.seconds(30),
      totalTimeout: Duration.minutes(30),
    });
  (assertions as AwsApiCall).waiterProvider?.addToRolePolicy({
    Effect: "Allow",
    Action: ["cloudwatch:DescribeAlarms"],
    Resource: ["*"],
  });

  // arrange -> act -> assertionの順で処理が実行されるように設定
  arrange.next(act).next(assertions);
});
