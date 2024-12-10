import { Stage, StageProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { SampleWebAppStack } from "../stacks/advent-calendar-2024-stack";

export interface AppDeployStageProps extends StageProps {
  emailAddress: string
}
export class AppDeployStage extends Stage {
  public readonly appStack: SampleWebAppStack;
  constructor(scope: Construct, id: string, props: AppDeployStageProps) {
    super(scope, id, props);

    this.appStack = new SampleWebAppStack(this, "ECSAppStack", {
      ...props,
    });
  }
}
