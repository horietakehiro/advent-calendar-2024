import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { SNSHandler } from "aws-lambda";

const logsClient = new CloudWatchLogsClient({});
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME;

interface AlarmEvent {
  AlarmName: string;
}
/**
 * SNSトピック経由で受信したアラームメッセージを、確認用のロググループにそのまま出力する
 * @param event
 */
export const handler: SNSHandler = async (event) => {
  console.log(JSON.stringify(event, null, 2));
  await Promise.all(
    event.Records.map(async (record) => {
      // アラーム名ごとにログストリームが作成されている前提とし、そこにアラームメッセージを出力する
      const { AlarmName }: AlarmEvent = JSON.parse(record.Sns.Message);

      const response = await logsClient.send(
        new PutLogEventsCommand({
          logGroupName: LOG_GROUP_NAME,
          logStreamName: AlarmName,
          logEvents: [
            {
              timestamp: new Date().getTime(),
              message: JSON.stringify(event),
            },
          ],
        })
      );
      console.log(JSON.stringify(response, null, 2));
    })
  );
};
