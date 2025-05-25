import { App } from "@slack/bolt";
import { OpenHandsManager } from "../../core/openhands/OpenHandsManager";
import {
  createOutputBlock,
  createFreeInputModal,
} from "../../core/slack/blocks";
import { logger } from "../../infrastructure/logger";

export const registerModalActions = (
  app: App,
  openhandsManager: OpenHandsManager,
  outputBuffer: Map<string, string>
) => {
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
      logger.error("Error opening free input modal:", error);
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
            blocks: createOutputBlock(
              currentOutput + `\n${actionMessage}`,
              true
            ),
          });
        }
      }
    } catch (error) {
      logger.error("Error handling free input modal submission:", error);
    }
  });
};
