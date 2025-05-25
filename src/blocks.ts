import { Block, KnownBlock } from "@slack/types";

type InteractiveChoice = {
  text: string;
  value: string;
  isSelected?: boolean;
  index: number; // 選択肢のインデックスを追加
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

  let foundQuestion = false;
  let choiceIndex = 0;

  console.log("=== Detecting interactive choices ===");
  console.log("Output:", output);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (questionPattern.test(line)) {
      foundQuestion = true;
      console.log("Found question at line", i);
      continue;
    }

    if (foundQuestion && line) {
      console.log(`Processing line ${i}: "${line}"`);

      // "> " で始まる行（選択されている）
      if (line.startsWith(">")) {
        const text = line.substring(1).trim();
        console.log("Found selected choice:", text);
        choices.push({
          text,
          value: choiceIndex.toString(), // インデックスを値として使用
          isSelected: true,
          index: choiceIndex,
        });
        choiceIndex++;
      }
      // ">" で始まらない行で、明らかに選択肢と思われるもの
      else if (line.match(/^(yes|no)/i)) {
        console.log("Found unselected choice:", line);
        choices.push({
          text: line,
          value: choiceIndex.toString(), // インデックスを値として使用
          isSelected: false,
          index: choiceIndex,
        });
        choiceIndex++;
      }
      // YesとNoが確定なので、それらを直接検出
      else if (
        line.toLowerCase().includes("yes") ||
        line.toLowerCase().includes("no")
      ) {
        console.log("Found Yes/No choice:", line);
        choices.push({
          text: line,
          value: choiceIndex.toString(), // インデックスを値として使用
          isSelected: false,
          index: choiceIndex,
        });
        choiceIndex++;
      }
    }
  }

  console.log("Final detected choices:", choices);
  return choices;
};

export const createInteractiveChoiceBlock = (
  output: string,
  choices: InteractiveChoice[]
): (Block | KnownBlock)[] => {
  console.log("=== Creating interactive choice block ===");
  console.log("Choices received:", JSON.stringify(choices, null, 2));

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
  ];

  // 選択肢のボタンを追加
  if (choices.length > 0) {
    console.log("Adding buttons for", choices.length, "choices");

    const actionElements = choices.map((choice) => {
      const button = {
        type: "button" as const,
        text: {
          type: "plain_text" as const,
          text: choice.text,
        },
        style: choice.isSelected ? ("primary" as const) : undefined,
        action_id: `interactive_choice_${choice.value}`,
        value: choice.value,
      };
      console.log("Creating button:", JSON.stringify(button, null, 2));
      return button;
    });

    blocks.push({
      type: "actions",
      elements: actionElements,
    });
  } else {
    console.log("No choices to add buttons for");
  }

  console.log("Final blocks structure:", JSON.stringify(blocks, null, 2));
  return blocks;
};
