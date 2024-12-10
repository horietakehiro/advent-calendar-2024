import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import { AWS_S3_BUCKET } from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_s3 as s3, Stack } from "aws-cdk-lib";

const stack = new Stack()
new s3.Bucket(stack, "Bucket", {
  versioned: true
})
const template = TypedTemplate.fromStack(stack)
// 単に標準コンストラクトの振る舞いをテストしているに過ぎない
test("S3バケットのバージョニングが有効化されている", () => {
  template.hasResource(AWS_S3_BUCKET({
    Properties: {
      VersioningConfiguration: {
        Status: "Enabled"
      }
    }
  }))
})