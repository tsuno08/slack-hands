import { Block, KnownBlock } from "@slack/types";

export const createLoadingBlock = (): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "🔄 Codexを起動しています...",
    },
  },
];

export const createOutputBlock = (
  output: string,
  isRunning: boolean = true
): (Block | KnownBlock)[] => {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`\n${output}\n\`\`\``,
      },
    },
  ];

  if (isRunning) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "⏹️ 停止",
            emoji: true,
          },
          style: "danger",
          action_id: "stop_codex",
        },
      ],
    });
  }

  return blocks;
};

export const createCompletedBlock = (
  output: string,
  code: number | null
): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `\`\`\`\n${output}\n\`\`\``,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: code === 0 ? "✅ 完了" : "❌ エラー",
    },
  },
];
