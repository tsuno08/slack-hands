import { Block, KnownBlock } from "@slack/types";

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
