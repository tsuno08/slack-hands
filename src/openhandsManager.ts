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

      // OpenHandsをDockerで実行
      const containerName = `openhands-${processKey.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${Date.now()}`;
      const workspaceMount = `${process.cwd()}/${
        this.config.openhandsWorkspace
      }:/workspace:rw`;

      // プロバイダーに応じたAPIキーを選択
      let apiKey = "";
      if (
        this.config.provider === "openai" ||
        this.config.model.includes("openai")
      ) {
        apiKey = process.env.OPENAI_API_KEY || "";
      } else if (
        this.config.provider === "anthropic" ||
        this.config.model.includes("anthropic")
      ) {
        apiKey = process.env.ANTHROPIC_API_KEY || "";
      } else {
        // その他のプロバイダーの場合、環境変数から推測
        apiKey =
          process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
      }

      const args = [
        "run",
        "-i",
        "--rm",
        "--pull=always",
        "-e",
        `SANDBOX_RUNTIME_CONTAINER_IMAGE=docker.all-hands.dev/all-hands-ai/runtime:0.39-nikolaik`,
        "-e",
        `SANDBOX_USER_ID=${process.getuid?.() || 1000}`,
        "-e",
        `SANDBOX_VOLUMES=${workspaceMount}`,
        "-e",
        `LLM_MODEL=${this.config.model}`,
        "-e",
        `LLM_API_KEY=${apiKey}`,
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-v",
        `${process.env.HOME}/.openhands-state:/.openhands-state`,
        "--add-host",
        "host.docker.internal:host-gateway",
        "--name",
        containerName,
        "docker.all-hands.dev/all-hands-ai/openhands:0.39",
        "python",
        "-m",
        "openhands.core.cli",
      ];

      logger.debug("OpenHands Docker command args:", args);

      const openhandsProcess = spawn("docker", args, {
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

          // タスクをOpenHandsに送信
          const process = this.processes.get(processKey);
          if (process && process.stdin) {
            process.stdin.write(message + "\n");
          }

          resolve(processKey);
        } else {
          logger.error(`Failed to start OpenHands process [${processKey}]`);
          reject(new Error("Failed to start OpenHands process"));
        }
      }, 3000); // Dockerコンテナの起動を待つため少し長めに設定
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
