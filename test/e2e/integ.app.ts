import {
  ExpectedResult,
  IntegTest,
  InvocationType,
  Match,
} from "@aws-cdk/integ-tests-alpha";
import {
  App,
  Duration,
  aws_lambda_nodejs as lambdaNodeJS,
  Stack,
} from "aws-cdk-lib";
import { E2ETestEvent, E2ETestResult } from "./client";
import path = require("path");

// 環境変数経由で必要な設定値(WEBアプリケーションのエンドポイントURL)を受け取る
const ENDPOINT_URL = process.env.ENDPOINT_URL;
if (ENDPOINT_URL === undefined) {
  throw Error("環境変数ENDPOINT_URLが未定義");
}

const app = new App();
const stack = new Stack(app, "e2e-test-client");
// WEBアプリケーションのエンドポイントにテスト用のリクエストを送信するためのLambda関数を用意する
const client = new lambdaNodeJS.NodejsFunction(stack, "Client", {
  entry: path.join(__dirname, "client.ts"),
  handler: "index.handler",
  timeout: Duration.minutes(15),
});

const integ = new IntegTest(app, "e2e", {
  testCases: [stack],
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
  },
});

// エンドポイントから200応答が返ることをテストする
integ.assertions
  .invokeFunction({
    functionName: client.functionName,
    invocationType: InvocationType.REQUEST_RESPONSE,
    payload: JSON.stringify({
      endpointURL: ENDPOINT_URL,
      requestCount: 1,
      expectedResponseCode: 200,
    } as E2ETestEvent),
  })
  .expect(
    ExpectedResult.objectLike({
      Payload: Match.serializedJson({
        result: "OK",
      } as E2ETestResult),
    })
  );

// 200以外の応答が返るリクエストを複数回送り、ログメトリックアラームが発報されることを期待する
integ.assertions
  .invokeFunction({
    functionName: client.functionName,
    invocationType: InvocationType.REQUEST_RESPONSE,
    payload: JSON.stringify({
      endpointURL: ENDPOINT_URL,
      requestOption: {
        method: "POST",
      },
      requestCount: 10,
    } as E2ETestEvent),
  })
  .expect(
    ExpectedResult.objectLike({
      Payload: Match.serializedJson({
        result: "OK",
      } as E2ETestResult),
    })
  );
