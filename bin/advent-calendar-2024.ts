#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PipelineStack } from "../lib/stacks/pipeline";
// import { AdventCalendar2024Stack } from '../lib/advent-calendar-2024-stack';

const app = new cdk.App();
new PipelineStack(app, "Pipeline", {
  codeCommitSource: {
    repositoryName: "advent-calendar-2024",
    branchName: "master",
  },
  appDeployStageProps: {
    emailAddress: "test@example.com"
  },
  env: {
    account: "382098889955",
    region: "ap-northeast-1",
  },
});
