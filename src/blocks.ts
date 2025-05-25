import { Block, KnownBlock } from "@slack/types";

type InteractiveChoice = {
  text: string;
  value: string;
  isSelected?: boolean;
};

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

export const createApprovalBlock = (output: string): (Block | KnownBlock)[] => [
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
      text: "⚠️ 承認が必要です。続行しますか？",
    },
  },
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "✅ Approve",
        },
        style: "primary",
        action_id: "approve_openhands",
        value: "approve",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "❌ Deny",
        },
        style: "danger",
        action_id: "deny_openhands",
        value: "deny",
      },
    ],
  },
];

export const createChoiceBlock = (
  question: string,
  choices: InteractiveChoice[]
): (Block | KnownBlock)[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: question,
    },
  },
  {
    type: "actions",
    elements: choices.map((choice) => ({
      type: "button",
      text: {
        type: "plain_text",
        text: choice.text,
      },
      value: choice.value,
      action_id: `choice_${choice.value}`,
    })),
  },
];

export const createCompletedBlock = (
  output: string,
  exitCode: number | null
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
        exitCode === 0
          ? "✅ OpenHandsが正常に完了しました"
          : `❌ OpenHandsが終了しました (Exit Code: ${exitCode})`,
    },
  },
];

export const detectApprovalNeeded = (output: string): boolean => {
  const approvalPatterns = [
    /do you want to continue\?/i,
    /continue\? \(y\/n\)/i,
    /proceed\? \(y\/n\)/i,
    /confirm\? \(y\/n\)/i,
    /\(y\/n\)/i,
    /press enter to continue/i,
    /waiting for approval/i,
  ];

  return approvalPatterns.some((pattern) => pattern.test(output));
};

export const detectInteractiveChoices = (
  output: string
): InteractiveChoice[] => {
  const lines = output.split("\n");
  const choices: InteractiveChoice[] = [];

  // "Do you wish to continue?" パターンを検出
  const questionPattern = /do you wish to continue\?/i;
  const selectedChoicePattern = /^>\s*(.+)$/; // "> " で始まる行（選択されている）
  const unselectedChoicePattern = /^([A-Za-z][^,\n>]*),?\s*$/; // ">" で始まらない選択肢

  let foundQuestion = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (questionPattern.test(line)) {
      foundQuestion = true;
      continue;
    }

    if (foundQuestion && line) {
      // "> Yes, proceed" 形式（選択されている）
      const selectedMatch = line.match(selectedChoicePattern);
      if (selectedMatch) {
        const text = selectedMatch[1].trim();
        choices.push({
          text,
          value: text.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          isSelected: true,
        });
      }
      // "No, exit" 形式（選択されていない）
      else if (unselectedChoicePattern.test(line) && !line.includes("?")) {
        const text = line.replace(/,$/, "").trim();
        choices.push({
          text,
          value: text.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          isSelected: false,
        });
      }
    }
  }

  return choices;
};

export const createInteractiveChoiceBlock = (
  output: string,
  choices: InteractiveChoice[]
): (Block | KnownBlock)[] => {
  const selectedChoice = choices.find((choice) => choice.isSelected);

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
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: selectedChoice
          ? `🤔 選択してください（現在選択中: *${selectedChoice.text}*）：`
          : "🤔 選択してください：",
      },
    },
    {
      type: "actions",
      elements: choices.map((choice) => ({
        type: "button",
        text: {
          type: "plain_text",
          text: choice.isSelected ? `> ${choice.text}` : choice.text,
        },
        style: choice.isSelected ? "primary" : undefined,
        action_id: "interactive_choice",
        value: choice.value,
      })),
    },
  ];

  // Enterキーで選択される選択肢がある場合、追加の説明を表示
  if (selectedChoice) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "⏎ Enter (デフォルト選択を実行)",
          },
          style: "primary",
          action_id: "interactive_choice",
          value: selectedChoice.value,
        },
      ],
    });
  }

  return blocks;
};
