import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import { AWS_S3_BUCKET } from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_s3 as s3, Stack } from "aws-cdk-lib";
import { Match } from "aws-cdk-lib/assertions";
import { Construct } from "constructs";

class MyBucket extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucket = new s3.Bucket(this, "Bucket", {});
    const cfnBUcket = bucket.node.defaultChild as s3.CfnBucket;
    cfnBUcket.addPropertyOverride(
      "NotificationConfiguration.EventBridgeConfiguration.EventBridgeEnabled",
      true
    );
  }
}

const stack = new Stack();
new MyBucket(stack, "MyBucket");
const template = TypedTemplate.fromStack(stack);
test("EventBridgeへのイベント通知設定が有効化されている", () => {
  template.hasResource(
    AWS_S3_BUCKET({
      Properties: {
        NotificationConfiguration: {
          EventBridgeConfiguration: Match.objectLike({
            EventBridgeEnabled: true,
          }),
        },
      },
    })
  );
});
test("スナップショットテスト", () => {
  expect(template.template).toMatchSnapshot();
});
