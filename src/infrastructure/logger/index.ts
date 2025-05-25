export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogLevelValue = {
  DEBUG: 0;
  INFO: 1;
  WARN: 2;
  ERROR: 3;
};

export const LOG_LEVELS: LogLevelValue = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export class Logger {
  private level: number;

  constructor(level: LogLevel = "INFO") {
    this.level = LOG_LEVELS[level];
  }

  private log = (level: LogLevel, message: string, ...args: any[]): void => {
    if (LOG_LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${level}:`;

    switch (level) {
      case "DEBUG":
        console.debug(prefix, message, ...args);
        break;
      case "INFO":
        console.info(prefix, message, ...args);
        break;
      case "WARN":
        console.warn(prefix, message, ...args);
        break;
      case "ERROR":
        console.error(prefix, message, ...args);
        break;
    }
  };

  debug = (message: string, ...args: any[]): void => {
    this.log("DEBUG", message, ...args);
  };

  info = (message: string, ...args: any[]): void => {
    this.log("INFO", message, ...args);
  };

  warn = (message: string, ...args: any[]): void => {
    this.log("WARN", message, ...args);
  };

  error = (message: string, ...args: any[]): void => {
    this.log("ERROR", message, ...args);
  };

  setLevel = (level: LogLevel): void => {
    this.level = LOG_LEVELS[level];
  };
}

// デフォルトロガーインスタンス
export const logger = new Logger(
  process.env.NODE_ENV === "development" ? "DEBUG" : "INFO"
);
