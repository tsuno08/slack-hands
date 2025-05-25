import { App } from "@slack/bolt";
import { OpenHandsManager } from "../../core/openhands/OpenHandsManager";
import { createOutputBlock } from "../../core/slack/blocks";
import { SlackUtils } from "../../core/slack/utils";
import { logger } from "../../infrastructure/logger";

export const registerStopAction = (
  app: App,
  openhandsManager: OpenHandsManager,
  outputBuffer: Map<string, string>
) => {
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
};
