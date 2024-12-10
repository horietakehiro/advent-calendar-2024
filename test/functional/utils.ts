import { IConstruct } from "constructs";
import { aws_logs as logs, RemovalPolicy, IAspect } from "aws-cdk-lib";

export class ApplyDestroyPolicyAspect implements IAspect {
  public visit(node: IConstruct) {
    if (node instanceof logs.CfnLogGroup) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
