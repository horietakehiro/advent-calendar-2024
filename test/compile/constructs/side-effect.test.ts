import { TypedTemplate } from "@horietakehiro/aws-cdk-utul/lib/assertions";
import { AWS_KMS_KEY } from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_logs, aws_iam as iam, aws_kms as kms, Stack } from "aws-cdk-lib";
import { Match } from "aws-cdk-lib/assertions";
import { Construct } from "constructs";

interface MyLogsProps {
  cmk: kms.IKey;
}
class MyLogs extends Construct {
  constructor(scope: Construct, id: string, props: MyLogsProps) {
    super(scope, id);

    // `props`で与えられた`cmk`でロググループを暗号化できるよう、必要なキーポリシーを付与する
    props.cmk.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal("logs.amazonaws.com", {
            region: Stack.of(this).region,
          }),
        ],
        actions: [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ],
        resources: ["*"],
        conditions: {
          ArnEquals: {
            "kms:EncryptionContext:aws:logs:arn": `"arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:*`,
          },
        },
      })
    );

    new aws_logs.LogGroup(this, "LogGroup", {
      encryptionKey: props.cmk,
    });
  }
}

const stack = new Stack();
const cmk = new kms.Key(stack, "CKM");
new MyLogs(stack, "MyLogs", { cmk });
const template = TypedTemplate.fromStack(stack);
test("`props`で渡したCMKに適切なキーポリシーが設定される", () => {
  template.hasResource(
    AWS_KMS_KEY({
      Properties: {
        KeyPolicy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: "logs.amazonaws.com" },
            }),
          ]),
        }),
      },
    })
  );
});

test("スナップショットテスト", () => {
  expect(template.template).toMatchSnapshot();
});
