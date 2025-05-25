import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { logger } from "./logger";

export class CodexManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private outputBuffer: Map<string, string> = new Map();

  constructor() {
    super();
  }

  public startCodex = (
    message: string,
    channel: string,
    ts: string
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const processKey = `${channel}-${ts}`;

      logger.info(`Starting Codex process for ${processKey}`, { message });

      // 既存のプロセスがある場合は停止
      this.stopProcess(processKey);

      // 出力バッファをクリア
      this.outputBuffer.set(processKey, "");

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        reject(new Error("OPENAI_API_KEY is not set"));
        return;
      }

      const args = [
        "--provider",
        process.env.PROVIDER || "openai",
        "--model",
        process.env.MODEL || "",
        "--approval-mode",
        "full-auto",
        message,
      ];

      logger.debug("Codex command args:", args);

      const codexProcess = spawn("codex", args, {
        env: {
          ...process.env,
        },
      });

      this.processes.set(processKey, codexProcess);

      codexProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        logger.debug(`Codex stdout [${processKey}]:`, output.trim());
        // 出力をバッファに追加
        const currentOutput = this.outputBuffer.get(processKey) || "";
        this.outputBuffer.set(processKey, currentOutput + output);
        this.emit("output", { channel, ts, output });
      });

      codexProcess.stderr?.on("data", (data: Buffer) => {
        const error = data.toString();
        logger.warn(`Codex stderr [${processKey}]:`, error.trim());
        this.emit("error", { channel, ts, error });
      });

      codexProcess.on("close", (code: number | null) => {
        logger.info(`Codex process closed [${processKey}] with code:`, code);
        this.processes.delete(processKey);
        this.outputBuffer.delete(processKey);
        this.emit("close", { channel, ts, code });
      });

      codexProcess.on("error", (error: Error) => {
        logger.error(`Codex process error [${processKey}]:`, error);
        this.processes.delete(processKey);
        this.outputBuffer.delete(processKey);
        reject(error);
      });

      // プロセスが正常に開始されたことを確認
      setTimeout(() => {
        if (this.processes.has(processKey)) {
          logger.info(`Codex process successfully started [${processKey}]`);
          resolve(processKey);
        } else {
          logger.error(`Failed to start Codex process [${processKey}]`);
          reject(new Error("Failed to start Codex process"));
        }
      }, 3000);
    });
  };

  public stopProcess = (processKey: string): boolean => {
    const process = this.processes.get(processKey);
    if (process && !process.killed) {
      logger.info(`Stopping Codex process [${processKey}]`);
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

  private getLastOutput = (processKey: string): string | null => {
    const output = this.outputBuffer.get(processKey);
    return output || null;
  };

  public getProcessKey = (channel: string, ts: string): string => {
    return `${channel}-${ts}`;
  };
}
