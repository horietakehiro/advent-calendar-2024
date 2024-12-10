import { setTimeout } from "timers/promises";

export interface E2ETestEvent {
  endpointURL: string;
  requestOption?: RequestInit;
  expectedResponseCode?: number;
  requestCount: number;
}
export interface E2ETestResult {
  result: "OK" | "NG";
}
export const handler = async (event: E2ETestEvent): Promise<E2ETestResult> => {
  console.log(event);
  for (let index = 0; index < event.requestCount; index++) {
    const response = await fetch(event.endpointURL, event.requestOption);
    console.log(JSON.stringify(response, null, 2));
    if (
      event.expectedResponseCode !== undefined &&
      event.expectedResponseCode !== response.status
    ) {
      return {
        result: "NG",
      };
    }
    await setTimeout(3 * 1000);
  }
  return { result: "OK" };
};
