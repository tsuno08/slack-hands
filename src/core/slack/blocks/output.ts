import { Block, KnownBlock } from "@slack/types";

export const createLoadingBlock = (): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "🔄 Loading... OpenHandsを起動しています...",
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
        text: `\`\`\`\n${
          output.length > 2900 ? output.slice(-2900) + "..." : output
        }\n\`\`\``,
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
            text: "⏹️ Stop",
          },
          style: "danger",
          action_id: "stop_openhands",
          value: "stop",
        },
      ],
    });
  }

  return blocks;
};

export const createCompletedBlock = (
  output: string,
  code?: number
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
      text:
        code === 0
          ? "✅ OpenHandsプロセスが正常に完了しました"
          : `❌ OpenHandsプロセスが終了しました (code: ${code})`,
    },
  },
];
