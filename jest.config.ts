import type { Config } from "jest";

const config: Config = {
  verbose: true,
  testEnvironment: "node",
  roots: ["<rootDir>/test/compile"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testTimeout: 60 * 60 * 1000,
};

export default config;
