import { App } from "@slack/bolt";
import { OpenHandsManager } from "../../core/openhands/OpenHandsManager";
import {
  createOutputBlock,
  detectInteractiveChoices,
} from "../../core/slack/blocks";
import { logger } from "../../infrastructure/logger";

export const registerInteractiveActions = (
  app: App,
  openhandsManager: OpenHandsManager,
  outputBuffer: Map<string, string>
) => {
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
      logger.error("Error handling interactive choice:", error);
    }
  });
};
