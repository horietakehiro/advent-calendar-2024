import {
  ExtraMatch,
  TypedTemplate,
} from "@horietakehiro/aws-cdk-utul/lib/assertions";
import {
  AWS_KMS_KEY,
  AWS_S3_BUCKET,
} from "@horietakehiro/aws-cdk-utul/lib/types/cfn-resource-types";
import { aws_s3 as s3, aws_kms as kms, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";

interface MyBucketProps {
  cmk: kms.IKey;
}
class MyBucket extends Construct {
  constructor(scope: Construct, id: string, props: MyBucketProps) {
    super(scope, id);
    new s3.Bucket(this, "Bucket", {
      encryption: s3.BucketEncryption.KMS,
      // 本来は下記のようにpropsで指定されたCMKを指定すべきだが指定が漏れている
      // この場合BucketのL2コンストラクトは自動的に新しいCMKを作成し、それを使用してしまうため、
      // CFNテンプレートの生成は意図しない形で成功してしまう。
      // encryptionKey: props.cmk
    });
  }
}
const stack = new Stack();
const cmk = new kms.Key(stack, "CMK");
new MyBucket(stack, "MyBucket", { cmk });
const template = TypedTemplate.fromStack(stack);

test.skip("propsで指定したCMKを使用してバケットが暗号化される", () => {
  const cmks = template
    .findResources(AWS_KMS_KEY())
    .filter(({ id }) => id.includes("CMK"));
  expect(cmks.length).toBe(1);
  template.hasResource(
    AWS_S3_BUCKET({
      Properties: {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                // propsで指定したCMKが使用されているかをテストすることで、コンストラクトの実装ミスに気づくことができる
                KMSMasterKeyID: ExtraMatch.getAttArn(cmks[0].id),
                SSEAlgorithm: "aws:kms",
              },
            },
          ],
        },
      },
    })
  );
});

test("スナップショットテスト", () => {
  expect(template.template).toMatchSnapshot();
});
