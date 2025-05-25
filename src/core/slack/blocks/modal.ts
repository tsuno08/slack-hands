import { Block, KnownBlock } from "@slack/types";

export const createFreeInputModal = (
  mentionText?: string,
  processKey?: string
) => ({
  type: "modal" as const,
  callback_id: "free_input_modal",
  private_metadata: processKey || "",
  title: {
    type: "plain_text" as const,
    text: "入力してください",
  },
  submit: {
    type: "plain_text" as const,
    text: "送信",
  },
  close: {
    type: "plain_text" as const,
    text: "キャンセル",
  },
  blocks: [
    {
      type: "input",
      block_id: "free_input_block",
      element: {
        type: "plain_text_input",
        action_id: "free_input_value",
        initial_value: mentionText || "",
        placeholder: {
          type: "plain_text" as const,
          text: "ここに入力してください...",
        },
      },
      label: {
        type: "plain_text" as const,
        text: "入力値",
      },
    },
  ],
});

export const createFreeInputBlock = (
  output: string,
  mentionText?: string,
  processKey?: string
): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `\`\`\`\n${
        output.length > 2900 ? output.slice(-2900) + "..." : output
      }\n\`\`\``,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "✏️ 自由入力が必要です。下のボタンから入力してください：",
    },
  },
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "入力する",
        },
        style: "primary",
        action_id: "open_free_input_modal",
        value: JSON.stringify({
          mentionText: mentionText || "",
          processKey: processKey || "",
        }),
      },
    ],
  },
];
