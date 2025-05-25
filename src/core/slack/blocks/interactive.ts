import { Block, KnownBlock } from "@slack/types";
import { InteractiveChoice } from "../../../shared/types";

export const detectInteractiveChoices = (
  output: string
): {
  choices: InteractiveChoice[];
  filteredOutput: string;
  isFreeInput: boolean;
} => {
  const lines = output.split("\n");
  const choices: InteractiveChoice[] = [];

  // "Do you wish to continue?" パターンを検出
  const questionPattern = /do you wish to continue\?/i;
  // ">" だけの行を検出（自由入力パターン）
  const freeInputPattern = /^>\s*$/;

  let foundQuestion = false;
  let choiceIndex = 0;
  let questionLineIndex = -1;
  let isFreeInput = false;

  console.log("=== Detecting interactive choices ===");
  console.log("Output:", output);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 自由入力パターンをチェック
    if (freeInputPattern.test(line)) {
      console.log("Found free input pattern at line", i);
      isFreeInput = true;
      questionLineIndex = i;
      break;
    }

    if (questionPattern.test(line)) {
      foundQuestion = true;
      questionLineIndex = i;
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

  // questionPatternまたはfreeInputPatternが見つかった場合、その行以降のみを含むフィルタされた出力を作成
  const filteredOutput =
    (foundQuestion || isFreeInput) && questionLineIndex >= 0
      ? lines.slice(questionLineIndex).join("\n")
      : output;

  console.log("Final detected choices:", choices);
  console.log("Filtered output:", filteredOutput);
  console.log("Is free input:", isFreeInput);
  return { choices, filteredOutput, isFreeInput };
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

    // Enterキーボタンを追加
    actionElements.push({
      type: "button" as const,
      text: {
        type: "plain_text" as const,
        text: "⏎ Enter",
      },
      style: "primary" as const,
      action_id: "interactive_choice_enter",
      value: "enter",
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
