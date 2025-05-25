import { App } from "@slack/bolt";
import dotenv from "dotenv";
import { loadConfig, validateConfig } from "./config";
import { CodexManager } from "./codexManager";
import { SlackUtils } from "./utils";
import { logger } from "./logger";
import {
  createLoadingBlock,
  createOutputBlock,
  createCompletedBlock,
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

// Codex マネージャーを初期化
const codexManager = new CodexManager(config);

// 出力を蓄積するためのマップ
const outputBuffer = new Map<string, string>();

// app_mention イベントのハンドラー
app.event("app_mention", async ({ event, client }) => {
  try {
    const { channel, text, ts, user } = event;

    logger.info("Received app mention", { channel, user, ts });

    // ボットのメンション部分を除去してタスクを取得
    const task = SlackUtils.extractMentionText(text);

    // ヘルプコマンドの処理
    if (!task || task.toLowerCase().includes("help") || task === "?") {
      logger.info("Help command requested", { channel, user });
      await client.chat.postMessage({
        channel: channel,
        text: `🤖 *Slack Hands Bot* へようこそ！

使用方法:
\`@${app.client.token ? "bot" : "slack-hands"} [タスクの説明]\`

例:
• \`@bot ウェブサイトにログイン機能を追加して\`
• \`@bot バグを修正してください\`
• \`@bot READMEファイルを更新して\`

機能:
• 🔄 リアルタイム出力表示
• ⏹️ プロセス停止
• 📁 Git リポジトリ連携

設定:
• Repository: ${config.repository}
• Model: ${config.model} (${config.provider})`,
        thread_ts: ts,
      });
      return;
    }

    if (!task) {
      logger.warn("Empty task received", { channel, user, ts });
      await client.chat.postMessage({
        channel: channel,
        text: "❌ タスクが指定されていません。メンションの後にタスクを記述してください。\n`help` とメンションすると使用方法を表示します。",
        thread_ts: ts,
      });
      return;
    }

    logger.info("Processing task", { task, channel, user });

    // 初期のローディングメッセージを送信
    const response = await client.chat.postMessage({
      channel: channel,
      text: "🔄 Codexを起動しています...",
      blocks: createLoadingBlock(),
      thread_ts: ts,
    });

    if (!response.ts) {
      throw new Error("Failed to post initial message");
    }

    const processKey = codexManager.getProcessKey(channel, response.ts);
    outputBuffer.set(processKey, "");

    try {
      // Codexプロセスを開始
      await codexManager.startCodex(task, channel, response.ts);
    } catch (error) {
      logger.error("Failed to start Codex process", error);
      await client.chat.postMessage({
        channel: channel,
        text: "❌ Codexプロセスの起動に失敗しました。",
        thread_ts: response.ts,
      });
      return;
    }
  } catch (error) {
    logger.error("Error in app_mention handler:", error);
    await client.chat.postMessage({
      channel: event.channel,
      text: "❌ エラーが発生しました。",
      thread_ts: event.ts,
    });
  }
});

// Codexからの出力を処理
codexManager.on("output", async ({ channel, ts, output }) => {
  try {
    const processKey = codexManager.getProcessKey(channel, ts);
    const currentOutput = outputBuffer.get(processKey) || "";
    const newOutput = currentOutput + output;
    outputBuffer.set(processKey, newOutput);

    const isRunning = codexManager.isProcessRunning(processKey);

    await app.client.chat.update({
      channel: channel,
      ts: ts,
      blocks: createOutputBlock(
        SlackUtils.truncateOutput(newOutput),
        isRunning
      ),
    });
  } catch (error) {
    logger.error("Error updating message with output:", error);
  }
});

// Codexプロセスが終了したときの処理
codexManager.on("close", async ({ channel, ts, code }) => {
  try {
    const processKey = codexManager.getProcessKey(channel, ts);
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
codexManager.on("error", async ({ channel, ts, error }) => {
  try {
    const processKey = codexManager.getProcessKey(channel, ts);
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

// Stopボタンのアクション
app.action("stop_codex", async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message } = body as any;
    const processKey = codexManager.getProcessKey(channel.id, message.ts);

    logger.info("Stop button pressed", { processKey });

    if (codexManager.stopProcess(processKey)) {
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
              text: "⏹️ Codexプロセスを停止しました",
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

// アプリケーションを開始
const startApp = async (): Promise<void> => {
  try {
    await app.start();
    logger.info("⚡️ Slack Hands Bot is running!");
    logger.info(`📁 Repository: ${config.repository}`);
    logger.info(`🤖 Model: ${config.model} (${config.provider})`);
  } catch (error) {
    logger.error("Failed to start the app:", error);
    process.exit(1);
  }
};

// 終了時のクリーンアップ
process.on("SIGINT", () => {
  logger.info("⏹️ Shutting down...");
  codexManager.stopAllProcesses();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("⏹️ Shutting down...");
  codexManager.stopAllProcesses();
  process.exit(0);
});

startApp();
