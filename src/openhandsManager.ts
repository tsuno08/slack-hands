import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as pty from "node-pty";
import { Config } from "./types";
import { logger } from "./logger";

type PtyProcess = {
  pty: pty.IPty;
  containerName: string;
};

export class OpenHandsManager extends EventEmitter {
  private processes: Map<string, PtyProcess> = new Map();
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

      const apiKey = process.env.LLM_API_KEY;
      if (!apiKey) {
        reject(new Error("LLM_API_KEY is not set"));
        return;
      }

      const args = [
        "run",
        "-it", // -i -t フラグを組み合わせてTTYモードを有効にする
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
        `${process.cwd()}/.openhands-state:/.openhands-state`,
        "--add-host",
        "host.docker.internal:host-gateway",
        "--name",
        containerName,
        "docker.all-hands.dev/all-hands-ai/openhands:0.39",
        "python",
        "-m",
        "openhands.cli.main",
      ];

      logger.debug("OpenHands Docker command args:", args);

      // node-ptyを使用してTTY環境でプロセスを起動
      const ptyProcess = pty.spawn("docker", args, {
        name: "xterm-color",
        cols: 120,
        rows: 30,
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...this.config.environment,
          TERM: "xterm-256color",
        },
      });

      const ptyData: PtyProcess = {
        pty: ptyProcess,
        containerName,
      };

      this.processes.set(processKey, ptyData);

      ptyProcess.onData((data: string) => {
        logger.debug(`OpenHands output [${processKey}]:`, data.trim());
        this.emit("output", { channel, ts, output: data });
      });

      ptyProcess.onExit((exitCode) => {
        const code = exitCode.exitCode;
        logger.info(
          `OpenHands process closed [${processKey}] with code:`,
          code
        );
        this.processes.delete(processKey);
        this.emit("close", { channel, ts, code });
      });

      // プロセスが正常に開始されたことを確認
      setTimeout(() => {
        if (this.processes.has(processKey)) {
          logger.info(`OpenHands process successfully started [${processKey}]`);

          // タスクをOpenHandsに送信
          const processData = this.processes.get(processKey);
          if (processData) {
            processData.pty.write(message + "\r");
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
    const processData = this.processes.get(processKey);
    if (processData) {
      logger.info(`Stopping OpenHands process [${processKey}]`);
      processData.pty.kill();
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
    const processData = this.processes.get(processKey);
    return processData !== undefined && processData.pty.pid !== undefined;
  };

  public sendApproval = (
    processKey: string,
    approval: string = "y"
  ): boolean => {
    const processData = this.processes.get(processKey);
    if (processData) {
      processData.pty.write(approval + "\r");
      return true;
    }
    return false;
  };

  public sendInteractiveChoice = (
    processKey: string,
    choice: string
  ): boolean => {
    console.log(`=== Sending interactive choice ===`);
    console.log(`Process key: ${processKey}`);
    console.log(`Choice: "${choice}"`);
    const processData = this.processes.get(processKey);
    if (processData) {
      console.log(`Writing to pty: "${choice}\\r"`);
      processData.pty.write(choice + "\r");
      console.log(`Successfully wrote to pty`);
      return true;
    } else {
      console.log(`Process not found`);
      console.log(`Process exists: ${!!processData}`);
    }
    return false;
  };

  public sendInteractiveChoiceByIndex = (
    processKey: string,
    targetIndex: number,
    currentIndex: number
  ): boolean => {
    console.log(`=== Sending interactive choice by index ===`);
    console.log(`Process key: ${processKey}`);
    console.log(`Target index: ${targetIndex}, Current index: ${currentIndex}`);

    const processData = this.processes.get(processKey);
    if (processData) {
      // 目標インデックスまでの距離を計算
      const steps = targetIndex - currentIndex;

      if (steps > 0) {
        // 下に移動（下矢印キー）
        for (let i = 0; i < steps; i++) {
          console.log(`Sending down arrow key (step ${i + 1}/${steps})`);
          processData.pty.write("\x1B[B"); // 下矢印キー
        }
      } else if (steps < 0) {
        // 上に移動（上矢印キー）
        const upSteps = Math.abs(steps);
        for (let i = 0; i < upSteps; i++) {
          console.log(`Sending up arrow key (step ${i + 1}/${upSteps})`);
          processData.pty.write("\x1B[A"); // 上矢印キー
        }
      }

      // 最後にEnterキーを送信
      console.log(`Sending Enter key`);
      processData.pty.write("\r");
      console.log(`Successfully completed interactive choice selection`);
      return true;
    } else {
      console.log(`Process not found`);
      console.log(`Process exists: ${!!processData}`);
    }
    return false;
  };

  public sendEnterKey = (processKey: string): boolean => {
    const processData = this.processes.get(processKey);
    if (processData) {
      processData.pty.write("\r");
      return true;
    }
    return false;
  };

  public getProcessKey = (channel: string, ts: string): string => {
    return `${channel}-${ts}`;
  };
}
