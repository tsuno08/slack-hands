import { App } from "@slack/bolt";
import { OpenHandsManager } from "../../core/openhands/OpenHandsManager";
import { createOutputBlock } from "../../core/slack/blocks";
import { logger } from "../../infrastructure/logger";

export const registerApprovalActions = (
  app: App,
  openhandsManager: OpenHandsManager,
  outputBuffer: Map<string, string>
) => {
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
          blocks: createOutputBlock(
            currentOutput + "\n✅ 承認されました",
            true
          ),
        });
      }
    } catch (error) {
      logger.error("Error approving process:", error);
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
          blocks: createOutputBlock(
            currentOutput + "\n❌ 拒否されました",
            true
          ),
        });
      }
    } catch (error) {
      logger.error("Error denying process:", error);
    }
  });
};
