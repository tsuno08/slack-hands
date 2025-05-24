import fs from "fs";
import path from "path";
import { Config } from "./types";

export const loadConfig = (): Config => {
  const configPath = path.join(process.cwd(), "config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      "config.json not found. Please create it based on the template."
    );
  }

  const configData = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configData) as Config;

  // 環境変数による設定の上書き
  if (process.env.REPOSITORY) config.repository = process.env.REPOSITORY;
  if (process.env.MODEL) config.model = process.env.MODEL;
  if (process.env.PROVIDER) config.provider = process.env.PROVIDER;

  return config;
};

export const validateConfig = (config: Config): void => {
  if (!config.repository) {
    throw new Error("Repository URL is required in config.json");
  }

  if (!config.model) {
    throw new Error("Model is required in config.json");
  }

  if (!config.provider) {
    throw new Error("Provider is required in config.json");
  }
};
