import {
  aws_iam as iam,
  aws_codecommit as codecommit,
  Stack,
  StackProps,
  Duration,
} from "aws-cdk-lib";
import {
  CodePipeline,
  CodePipelineSource,
  CodeBuildStep,
  ManualApprovalStep,
} from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import {
  AppDeployStage,
  AppDeployStageProps,
} from "../stages/app-deploy-stage";

export interface PipelineStackProps extends StackProps {
  codeCommitSource: {
    repositoryName: string;
    branchName: string;
  };
  appDeployStageProps: AppDeployStageProps;
}
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // CI/CDパイプラインの過程で機能テスト及びE2Eテストを実行するためのIAMロール
    const testRole = new iam.Role(this, "TestRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    const pipeline = new CodePipeline(this, "Pipeline", {
      synth: new CodeBuildStep("Synth", {
        commands: [
          "npm ci",
          // コンパイルテスト
          "npm test",
          // 機能テスト
          // ここで最終テスト成功時のスナップショットと最新のコンストラクトの実装とで差分が発見された場合は
          // その時点でパイプラインを失敗させる。
          `npx integ-runner --directory test/functional/sample-web-app/02/ --parallel-regions ${this.region}`,
          "npx cdk synth",
        ],
        input: CodePipelineSource.codeCommit(
          codecommit.Repository.fromRepositoryName(
            this,
            "Repository",
            props.codeCommitSource.repositoryName
          ),
          props.codeCommitSource.branchName
        ),
        timeout: Duration.hours(1),
        role: testRole,
      }),
    });

    // WEBアプリケーションスタックのデプロイステージ
    const appDeployStage = new AppDeployStage(this, "AppDeployStage", {
      ...props.appDeployStageProps,
    });
    pipeline.addStage(appDeployStage);

    // E2Eテストステージ
    // 機能テストとは異なり、スナップショットテストの成否に関わらず必ず実際のテストが実施されるように設定する
    const e2eTestStep = new CodeBuildStep("E2ETest", {
      timeout: Duration.hours(1),
      role: testRole,
      commands: [
        "npm ci",
        `npx integ-runner --directory test/e2e/ --parallel-regions ${this.region} --update-on-failed --force`,
      ],
      envFromCfnOutputs: {
        ENDPOINT_URL: appDeployStage.appStack.endpointURL,
      },
    });
    // E2Eテストが成功したら、その結果(メールの受信結果等)を確認してもらうよう
    // 手動承認のステップを実行する
    const manualApprovalStep = new ManualApprovalStep("ManualApprove", {
      comment:
        "E2Eテストが実行されました。アラーム発報メールが受信できているか確認してください。",
    });
    manualApprovalStep.addStepDependency(e2eTestStep);
    pipeline.addWave("E2ETest", {
      pre: [e2eTestStep],
      post: [manualApprovalStep],
    });
  }
}
