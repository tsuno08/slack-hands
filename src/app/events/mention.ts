import { App } from "@slack/bolt";
import { OpenHandsManager } from "../../core/openhands/OpenHandsManager";
import { SlackUtils } from "../../core/slack/utils";
import { createLoadingBlock } from "../../core/slack/blocks";
import { logger } from "../../infrastructure/logger";

export const registerMentionEvent = (
  app: App,
  openhandsManager: OpenHandsManager,
  outputBuffer: Map<string, string>,
  mentionBuffer: Map<string, string>
) => {
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
};
