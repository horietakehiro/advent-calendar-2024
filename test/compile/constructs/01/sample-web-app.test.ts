import { aws_sns, Stack } from "aws-cdk-lib";
import { SampleWebApp } from "../../../../lib/constructs/01/sample-web-app";
import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import {
  AWS_CLOUDWATCH_ALARM,
  AWS_ECS_TASKDEFINITION,
  AWS_SNS_TOPIC,
} from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";

const stack = new Stack();
const topic = new aws_sns.Topic(stack, "Topic");
new SampleWebApp(stack, "SampleWebApp", {
  webAppImageName: "test-image",
  topic: topic,
});
const template = TypedTemplate.fromStack(stack);
describe("SampleWebAppコンストラクタ", () => {
  test("`props`で指定した`webAppImageName`がタスク定義に設定されている", () => {
    const taskDefinition = template.getResource(AWS_ECS_TASKDEFINITION());
    expect(
      JSON.stringify(
        taskDefinition.def.Properties?.ContainerDefinitions![0].Image
      )
    ).toContain("test-image");
  });
  test("`props`で指定した`topic`がアラームアクションに設定されている", () => {
    const topic = template.getResource(AWS_SNS_TOPIC());
    const alarms = template.findResources(AWS_CLOUDWATCH_ALARM());
    expect(alarms.length).toBeGreaterThan(0);
    alarms.forEach((alarm) => {
      expect(JSON.stringify(alarm.def!.Properties!.AlarmActions)).toContain(
        topic.id
      );
    });
  });

  const invalidImageNames = [
    "123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/nginx",
    "nginx:latest",
  ];
  invalidImageNames.forEach((imageName) => {
    test(`"props"の"webAppImageName"の値が不適切(${imageName})な場合にバリデーションエラーとなる`, () => {
      expect(
        () =>
          new SampleWebApp(stack, "Invalid", {
            topic: topic,
            webAppImageName: imageName,
          })
      ).toThrow();
    });
  });

  test("スナップショットテスト", () => {
    expect(template.template).toMatchSnapshot();
  });
});
