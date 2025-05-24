import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { Config } from "./types";
import { logger } from "./logger";

export class OpenHandsManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private config: Config;

  constructor(config: Config) {
    super();
    this.config = config;
  }

  public startOpenHands = (
    message: string,
    channel: string,
    ts: string
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const processKey = `${channel}-${ts}`;

      logger.info(`Starting OpenHands process for ${processKey}`, { message });

      // 既存のプロセスがある場合は停止
      this.stopProcess(processKey);

      const args = [
        "cli-mode",
        "--model",
        this.config.model,
        "--provider",
        this.config.provider,
        "--repo",
        this.config.repository,
        "--workspace",
        this.config.openhandsWorkspace,
        "--max-iterations",
        this.config.maxIterations.toString(),
        "--task",
        message,
      ];

      logger.debug("OpenHands command args:", args);

      const openhandsProcess = spawn("openhands", args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...this.config.environment,
        },
      });

      this.processes.set(processKey, openhandsProcess);

      openhandsProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        logger.debug(`OpenHands stdout [${processKey}]:`, output.trim());
        this.emit("output", { channel, ts, output });
      });

      openhandsProcess.stderr?.on("data", (data: Buffer) => {
        const error = data.toString();
        logger.warn(`OpenHands stderr [${processKey}]:`, error.trim());
        this.emit("error", { channel, ts, error });
      });

      openhandsProcess.on("close", (code: number | null) => {
        logger.info(
          `OpenHands process closed [${processKey}] with code:`,
          code
        );
        this.processes.delete(processKey);
        this.emit("close", { channel, ts, code });
      });

      openhandsProcess.on("error", (error: Error) => {
        logger.error(`OpenHands process error [${processKey}]:`, error);
        this.processes.delete(processKey);
        reject(error);
      });

      // プロセスが正常に開始されたことを確認
      setTimeout(() => {
        if (this.processes.has(processKey)) {
          logger.info(`OpenHands process successfully started [${processKey}]`);
          resolve(processKey);
        } else {
          logger.error(`Failed to start OpenHands process [${processKey}]`);
          reject(new Error("Failed to start OpenHands process"));
        }
      }, 1000);
    });
  };

  public stopProcess = (processKey: string): boolean => {
    const process = this.processes.get(processKey);
    if (process && !process.killed) {
      logger.info(`Stopping OpenHands process [${processKey}]`);
      process.kill("SIGTERM");
      this.processes.delete(processKey);
      return true;
    }
    logger.warn(`Process not found or already stopped [${processKey}]`);
    return false;
  };

  public stopAllProcesses = (): void => {
    for (const [key] of this.processes) {
      this.stopProcess(key);
    }
  };

  public isProcessRunning = (processKey: string): boolean => {
    const process = this.processes.get(processKey);
    return process !== undefined && !process.killed;
  };

  public sendApproval = (
    processKey: string,
    approval: string = "y"
  ): boolean => {
    const process = this.processes.get(processKey);
    if (process && process.stdin) {
      process.stdin.write(approval + "\n");
      return true;
    }
    return false;
  };

  public getProcessKey = (channel: string, ts: string): string => {
    return `${channel}-${ts}`;
  };
}
