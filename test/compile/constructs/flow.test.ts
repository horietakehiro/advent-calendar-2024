import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import { AWS_S3_BUCKET } from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_s3, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
interface MyBucketProps {
  autoDeleteObjects?: boolean;
  appNames: string[];
}
class MyBucket extends Construct {
  constructor(scope: Construct, id: string, props: MyBucketProps) {
    super(scope, id);

    // アプリケーションごとにバケットを作成
    props.appNames.forEach((appName) => {
      new aws_s3.Bucket(this, `Bucket${appName}`, {
        // オブジェクトの自動削除設定が明示的に指定されたときのみ有効化する
        autoDeleteObjects: props.autoDeleteObjects ?? false,
        removalPolicy: props.autoDeleteObjects
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN,
      });
    });
  }
}

test("アプリケーションの数だけバケットが作成される", () => {
  const stack = new Stack();
  new MyBucket(stack, "Bucket", { appNames: ["app1", "app2", "app3"] });
  const template = TypedTemplate.fromStack(stack);

  template.resourceCountIs(AWS_S3_BUCKET, 3);
});
test("デフォルトではオブジェクトの自動削除設定は無効化される", () => {
  const stack = new Stack();
  new MyBucket(stack, "Bucket", { appNames: ["app1"] });
  const template = TypedTemplate.fromStack(stack);

  template.hasResource(AWS_S3_BUCKET({ DeletionPolicy: "Retain" }));
  template.template.resourceCountIs("Custom::S3AutoDeleteObjects", 0);
});
test("`props`の`autoDeleteObjects`をtrueに設定することで、オブジェクトの自動削除設定が有効か化される", () => {
  const stack = new Stack();
  new MyBucket(stack, "Bucket", {
    autoDeleteObjects: true,
    appNames: ["app1"],
  });
  const template = TypedTemplate.fromStack(stack);

  template.hasResource(AWS_S3_BUCKET({ DeletionPolicy: "Delete" }));
  template.template.resourceCountIs("Custom::S3AutoDeleteObjects", 1);
});

test("スナップショットテスト", () => {
  const stack = new Stack();
  new MyBucket(stack, "Bucket", {
    autoDeleteObjects: true,
    appNames: ["app1"],
  });
  const template = TypedTemplate.fromStack(stack);
  expect(template.template).toMatchSnapshot();
});
