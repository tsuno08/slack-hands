import { Config } from "../../shared/types";

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
