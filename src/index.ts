import { App } from "@slack/bolt";
import dotenv from "dotenv";
import { loadConfig, validateConfig } from "./config";
import { OpenHandsManager } from "./openhandsManager";
import { SlackUtils } from "./utils";
import { logger } from "./logger";
import {
  createLoadingBlock,
  createOutputBlock,
  createApprovalBlock,
  createCompletedBlock,
  detectApprovalNeeded,
  detectInteractiveChoices,
  createInteractiveChoiceBlock,
} from "./blocks";

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

// app_mention イベントのハンドラー
app.event("app_mention", async ({ event, client }) => {
  try {
    const { channel, text, ts, user } = event;

    logger.info("Received app mention", { channel, user, ts });

    // ボットのメンション部分を除去してタスクを取得
    const task = SlackUtils.extractMentionText(text);

    if (!task) {
      logger.warn("Empty task received", { channel, user, ts });
      await client.chat.postMessage({
        channel: channel,
        text: "❌ タスクが指定されていません。メンションの後にタスクを記述してください。",
        thread_ts: ts,
      });
      return;
    }

    logger.info("Processing task", { task, channel, user });

    // 初期のローディングメッセージを送信
    const response = await client.chat.postMessage({
      channel: channel,
      blocks: createLoadingBlock(),
      thread_ts: ts,
    });

    if (!response.ts) {
      throw new Error("Failed to post initial message");
    }

    const processKey = openhandsManager.getProcessKey(channel, response.ts);
    outputBuffer.set(processKey, "");

    try {
      // OpenHandsプロセスを開始
      await openhandsManager.startOpenHands(task, channel, response.ts);
    } catch (error) {
      logger.error("Failed to start OpenHands process", error);
      await client.chat.update({
        channel: channel,
        ts: response.ts,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❌ OpenHandsの起動に失敗しました: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          },
        ],
      });
    }
  } catch (error) {
    logger.error("Error handling app_mention:", error);
  }
});

// OpenHandsからの出力を処理
openhandsManager.on("output", async ({ channel, ts, output }) => {
  try {
    const processKey = openhandsManager.getProcessKey(channel, ts);
    const currentOutput = outputBuffer.get(processKey) || "";
    const newOutput = currentOutput + output;
    outputBuffer.set(processKey, newOutput);

    const isRunning = openhandsManager.isProcessRunning(processKey);

    // インタラクティブな選択肢をチェック
    const interactiveChoices = detectInteractiveChoices(output);
    console.log("=== Interactive Choice Detection Result ===");
    console.log("Raw output:", output);
    console.log("Detected choices:", interactiveChoices);
    console.log("Choices length:", interactiveChoices.length);

    if (interactiveChoices.length > 0) {
      logger.info("Interactive choices detected", {
        processKey,
        choices: interactiveChoices,
      });
      console.log("About to call createInteractiveChoiceBlock...");

      try {
        const blocks = createInteractiveChoiceBlock(
          SlackUtils.truncateOutput(newOutput),
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
    console.error("Error handling process close:", error);
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
    console.error("Error updating message with error:", updateError);
  }
});

// Stopボタンのアクション
app.action("stop_openhands", async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message } = body as any;
    const processKey = openhandsManager.getProcessKey(channel.id, message.ts);

    logger.info("Stop button pressed", { processKey });

    if (openhandsManager.stopProcess(processKey)) {
      const currentOutput = outputBuffer.get(processKey) || "";

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: SlackUtils.formatCodeBlock(
                SlackUtils.truncateOutput(currentOutput)
              ),
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "⏹️ OpenHandsプロセスを停止しました",
            },
          },
        ],
      });

      outputBuffer.delete(processKey);
    }
  } catch (error) {
    logger.error("Error stopping process:", error);
  }
});

// Approveボタンのアクション
app.action("approve_openhands", async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message } = body as any;
    const processKey = openhandsManager.getProcessKey(channel.id, message.ts);

    if (openhandsManager.sendApproval(processKey, "y")) {
      const currentOutput = outputBuffer.get(processKey) || "";

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: createOutputBlock(currentOutput + "\n✅ 承認されました", true),
      });
    }
  } catch (error) {
    console.error("Error approving process:", error);
  }
});

// Denyボタンのアクション
app.action("deny_openhands", async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message } = body as any;
    const processKey = openhandsManager.getProcessKey(channel.id, message.ts);

    if (openhandsManager.sendApproval(processKey, "n")) {
      const currentOutput = outputBuffer.get(processKey) || "";

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: createOutputBlock(currentOutput + "\n❌ 拒否されました", true),
      });
    }
  } catch (error) {
    console.error("Error denying process:", error);
  }
});

// インタラクティブ選択肢ボタンのアクション
app.action("interactive_choice", async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message, actions } = body as any;
    const processKey = openhandsManager.getProcessKey(channel.id, message.ts);
    const selectedValue = actions[0]?.value;
    const buttonText = actions[0]?.text?.text || "";

    let success = false;
    let actionMessage = "";

    if (buttonText.includes("Enter")) {
      // Enterキーが押された場合（デフォルト選択を実行）
      success = openhandsManager.sendEnterKey(processKey);
      actionMessage = "⏎ デフォルト選択を実行しました";
    } else if (selectedValue) {
      // 特定の選択肢が選ばれた場合
      success = openhandsManager.sendInteractiveChoice(
        processKey,
        selectedValue
      );
      actionMessage = `🔹 選択: ${selectedValue}`;
    }

    if (success) {
      const currentOutput = outputBuffer.get(processKey) || "";

      await client.chat.update({
        channel: channel.id,
        ts: message.ts,
        blocks: createOutputBlock(currentOutput + `\n${actionMessage}`, true),
      });
    }
  } catch (error) {
    console.error("Error handling interactive choice:", error);
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
