import { aws_ec2 as ec2, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

const stack = new Stack();
new ec2.Vpc(stack, "VPC", {
  maxAzs: 4,
  subnetConfiguration: [
    // 一度cidrMask: 24でスナップショットを作成し、その後cidrMask: 26に更新する
    // { subnetType: ec2.SubnetType.PUBLIC, name: "Public", cidrMask: 24 },
    { subnetType: ec2.SubnetType.PUBLIC, name: "Public", cidrMask: 26 },
  ],
});
const template = Template.fromStack(stack);
test("サブネットが合計2つ作成される", () => {
  template.resourceCountIs("AWS::EC2::Subnet", 2);
});

test("スナップショットテスト", () => {
  expect(template).toMatchSnapshot();
});
