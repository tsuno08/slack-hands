import dotenv from "dotenv";

// 環境変数を読み込み
dotenv.config();

// 必要な環境変数のチェック
const requiredEnvVars = [
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "SLACK_SIGNING_SECRET",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_PROVIDER",
  "REPOSITORY",
];

export const initializeConfig = () => {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} environment variable is required`);
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.LLM_API_KEY;
  }

  return {
    botToken: process.env.SLACK_BOT_TOKEN as string,
    appToken: process.env.SLACK_APP_TOKEN as string,
    signingSecret: process.env.SLACK_SIGNING_SECRET as string,
  };
};
