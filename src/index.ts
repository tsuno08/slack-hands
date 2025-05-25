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
  createFreeInputBlock,
  createFreeInputModal,
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
// メンション時のテキストを保存するためのマップ
const mentionBuffer = new Map<string, string>();

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

    // メンション時のテキストを保存
    mentionBuffer.set(processKey, task);

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
app.action(/^interactive_choice_/, async ({ ack, body, client }) => {
  await ack();

  try {
    const { channel, message, actions } = body as any;
    const processKey = openhandsManager.getProcessKey(channel.id, message.ts);
    const selectedValue = actions[0]?.value;
    const buttonText = actions[0]?.text?.text || "";
    const actionId = actions[0]?.action_id || "";

    console.log(`=== Interactive Choice Button Pressed ===`);
    console.log(`Process key: ${processKey}`);
    console.log(`Action ID: ${actionId}`);
    console.log(`Selected value: "${selectedValue}"`);
    console.log(`Button text: "${buttonText}"`);
    console.log(`Full actions:`, JSON.stringify(actions, null, 2));

    let success = false;
    let actionMessage = "";

    if (buttonText.includes("Enter")) {
      // Enterキーが押された場合（デフォルト選択を実行）
      console.log(`Sending Enter key...`);
      success = openhandsManager.sendEnterKey(processKey);
      actionMessage = "⏎ デフォルト選択を実行しました";
    } else if (selectedValue) {
      // 特定の選択肢が選ばれた場合
      const targetIndex = parseInt(selectedValue);
      console.log(`Target index: ${targetIndex}`);

      // 現在選択されている選択肢のインデックスを取得
      // 出力バッファから現在の選択状況を再解析
      const currentOutput = outputBuffer.get(processKey) || "";
      const currentResult = detectInteractiveChoices(currentOutput);
      const currentChoices = currentResult.choices;
      const currentSelectedChoice = currentChoices.find(
        (choice) => choice.isSelected
      );
      const currentIndex = currentSelectedChoice
        ? currentSelectedChoice.index
        : 0;

      console.log(
        `Current index: ${currentIndex}, Target index: ${targetIndex}`
      );
      console.log(
        `Moving from choice ${currentIndex} to choice ${targetIndex}`
      );

      success = openhandsManager.sendInteractiveChoiceByIndex(
        processKey,
        targetIndex,
        currentIndex
      );
      actionMessage = `🔹 選択: ${buttonText}`;
    }

    console.log(`Send success: ${success}`);

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

// 自由入力モーダルを開くボタンのアクション
app.action("open_free_input_modal", async ({ ack, body, client }) => {
  await ack();

  try {
    const { trigger_id } = body as any;
    const actions = (body as any).actions;
    const buttonValue = actions[0]?.value || "{}";

    let mentionText = "";
    let processKey = "";

    try {
      const parsed = JSON.parse(buttonValue);
      mentionText = parsed.mentionText || "";
      processKey = parsed.processKey || "";
    } catch (e) {
      // 古い形式の場合はmentionTextとして扱う
      mentionText = buttonValue;
    }

    await client.views.open({
      trigger_id,
      view: createFreeInputModal(mentionText, processKey),
    });
  } catch (error) {
    console.error("Error opening free input modal:", error);
  }
});

// 自由入力モーダルの送信処理
app.view("free_input_modal", async ({ ack, body, client }) => {
  await ack();

  try {
    const { user, view } = body;
    const values = view.state.values;
    const inputValue = values.free_input_block.free_input_value.value || "";
    const processKey = view.private_metadata || "";

    if (processKey && inputValue.trim()) {
      console.log(`=== Free Input Submitted ===`);
      console.log(`Process key: ${processKey}`);
      console.log(`Input value: "${inputValue}"`);

      // 自由入力をOpenHandsに送信
      const success = openhandsManager.sendFreeInput(
        processKey,
        inputValue.trim()
      );

      if (success) {
        const parts = processKey.split("-");
        const targetChannel = parts[0];
        const targetTs = parts[1];
        const currentOutput = outputBuffer.get(processKey) || "";
        const actionMessage = `📝 入力: ${inputValue}`;

        await client.chat.update({
          channel: targetChannel,
          ts: targetTs,
          blocks: createOutputBlock(currentOutput + `\n${actionMessage}`, true),
        });
      }
    }
  } catch (error) {
    console.error("Error handling free input modal submission:", error);
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
