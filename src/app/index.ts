import { App } from "@slack/bolt";
import dotenv from "dotenv";
import { loadConfig, validateConfig } from "../infrastructure/config";
import { OpenHandsManager } from "../core/openhands/OpenHandsManager";
import { SlackUtils } from "../core/slack/utils";
import { logger } from "../infrastructure/logger";
import {
  createOutputBlock,
  createApprovalBlock,
  createCompletedBlock,
  detectApprovalNeeded,
  detectInteractiveChoices,
  createInteractiveChoiceBlock,
  createFreeInputBlock,
} from "../core/slack/blocks";
import { registerMentionEvent } from "./events";
import {
  registerApprovalActions,
  registerStopAction,
  registerInteractiveActions,
  registerModalActions,
} from "./actions";

// 環境変数を読み込み
dotenv.config();

// 設定を読み込み
const config = loadConfig();
validateConfig(config);

logger.info("Configuration loaded successfully", {
  repository: config.repository,
  model: config.model,
  provider: config.provider,
});

// Slack Bolt アプリを初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

// OpenHands マネージャーを初期化
const openhandsManager = new OpenHandsManager(config);

// 出力を蓄積するためのマップ
const outputBuffer = new Map<string, string>();
// メンション時のテキストを保存するためのマップ
const mentionBuffer = new Map<string, string>();

// イベントハンドラーを登録
registerMentionEvent(app, openhandsManager, outputBuffer, mentionBuffer);

// アクションハンドラーを登録
registerApprovalActions(app, openhandsManager, outputBuffer);
registerStopAction(app, openhandsManager, outputBuffer);
registerInteractiveActions(app, openhandsManager, outputBuffer);
registerModalActions(app, openhandsManager, outputBuffer);

// OpenHandsからの出力を処理
openhandsManager.on("output", async ({ channel, ts, output }) => {
  try {
    const processKey = openhandsManager.getProcessKey(channel, ts);
    const currentOutput = outputBuffer.get(processKey) || "";
    const newOutput = currentOutput + output;
    outputBuffer.set(processKey, newOutput);

    const isRunning = openhandsManager.isProcessRunning(processKey);

    // インタラクティブな選択肢をチェック
    const interactiveResult = detectInteractiveChoices(output);
    const {
      choices: interactiveChoices,
      filteredOutput,
      isFreeInput,
    } = interactiveResult;
    console.log("=== Interactive Choice Detection Result ===");
    console.log("Raw output:", output);
    console.log("Filtered output:", filteredOutput);
    console.log("Detected choices:", interactiveChoices);
    console.log("Choices length:", interactiveChoices.length);
    console.log("Is free input:", isFreeInput);

    if (isFreeInput) {
      logger.info("Free input required detected", { processKey });
      const mentionText = mentionBuffer.get(processKey) || "";
      console.log("About to call createFreeInputBlock...");

      try {
        const blocks = createFreeInputBlock(
          SlackUtils.truncateOutput(filteredOutput),
          mentionText,
          processKey
        );
        console.log("Generated free input blocks:", blocks);

        await app.client.chat.update({
          channel: channel,
          ts: ts,
          blocks: blocks,
        });
        console.log("Slack message updated with free input prompt");
      } catch (slackError) {
        console.error(
          "Error updating Slack message with free input prompt:",
          slackError
        );
        logger.error("Slack update error:", slackError);
      }
    } else if (interactiveChoices.length > 0) {
      logger.info("Interactive choices detected", {
        processKey,
        choices: interactiveChoices,
      });
      console.log("About to call createInteractiveChoiceBlock...");

      try {
        const blocks = createInteractiveChoiceBlock(
          SlackUtils.truncateOutput(filteredOutput), // フィルタされた出力を使用
          interactiveChoices
        );
        console.log("Generated blocks:", blocks);

        await app.client.chat.update({
          channel: channel,
          ts: ts,
          blocks: blocks,
        });
        console.log("Slack message updated with interactive choices");
      } catch (slackError) {
        console.error(
          "Error updating Slack message with interactive choices:",
          slackError
        );
        logger.error("Slack update error:", slackError);
      }
    }
    // 承認が必要かチェック
    else if (detectApprovalNeeded(output)) {
      logger.info("Approval required detected", { processKey });
      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createApprovalBlock(SlackUtils.truncateOutput(newOutput)),
      });
    } else {
      await app.client.chat.update({
        channel: channel,
        ts: ts,
        blocks: createOutputBlock(
          SlackUtils.truncateOutput(newOutput),
          isRunning
        ),
      });
    }
  } catch (error) {
    logger.error("Error updating message with output:", error);
  }
});

// OpenHandsプロセスが終了したときの処理
openhandsManager.on("close", async ({ channel, ts, code }) => {
  try {
    const processKey = openhandsManager.getProcessKey(channel, ts);
    const finalOutput = outputBuffer.get(processKey) || "";

    await app.client.chat.update({
      channel: channel,
      ts: ts,
      blocks: createCompletedBlock(finalOutput, code),
    });

    outputBuffer.delete(processKey);
  } catch (error) {
    logger.error("Error handling process close:", error);
  }
});

// エラー処理
openhandsManager.on("error", async ({ channel, ts, error }) => {
  try {
    const processKey = openhandsManager.getProcessKey(channel, ts);
    const currentOutput = outputBuffer.get(processKey) || "";
    const errorOutput = currentOutput + `\nError: ${error}`;

    await app.client.chat.update({
      channel: channel,
      ts: ts,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`\`\`\n${errorOutput}\n\`\`\``,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "❌ エラーが発生しました",
          },
        },
      ],
    });
  } catch (updateError) {
    logger.error("Error updating message with error:", updateError);
  }
});

// アプリケーションを開始
const startApp = async (): Promise<void> => {
  try {
    await app.start();
    logger.info("⚡️ Slack Hands Bot is running!");
    logger.info(`📁 Repository: ${config.repository}`);
    logger.info(`🤖 Model: ${config.model} (${config.provider})`);
    logger.info(`📂 Workspace: ${config.openhandsWorkspace}`);
  } catch (error) {
    logger.error("Failed to start the app:", error);
    process.exit(1);
  }
};

// 終了時のクリーンアップ
process.on("SIGINT", () => {
  logger.info("⏹️ Shutting down...");
  openhandsManager.stopAllProcesses();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("⏹️ Shutting down...");
  openhandsManager.stopAllProcesses();
  process.exit(0);
});

startApp();
