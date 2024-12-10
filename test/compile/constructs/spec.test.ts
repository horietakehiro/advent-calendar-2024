import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import { AWS_S3_BUCKET } from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_s3 as s3, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";

class SaaSBucket extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    // このバケットは連携するSaaSの都合で、
    // 必ずバケット名を`saas-hoge-`から始める必要がある
    new s3.Bucket(this, "Bucket", {
      bucketName: `saas-hoge-${Stack.of(this).region}-${Stack.of(this).account}`,
    });
  }
}

const stack = new Stack();
new SaaSBucket(stack, "SaaSBucket");
const template = TypedTemplate.fromStack(stack);
test("SaaS連携用のバケットは、SaaS側の都合で必ずバケット名を`ssas-hoge-`から始める必要がある", () => {
  const { def } = template.getResource(AWS_S3_BUCKET());
  expect(JSON.stringify(def.Properties?.BucketName)).toContain("saas-hoge-");
});
test("スナップショットテスト", () => {
  expect(template.template).toMatchSnapshot();
});
