export type SlackMessage = {
  channel: string;
  ts: string;
  user: string;
  text: string;
};

export type ButtonAction = {
  type: "button";
  action_id: string;
  block_id: string;
  text: {
    type: "plain_text";
    text: string;
  };
  value: string;
};

export type InteractiveChoice = {
  text: string;
  value: string;
  isSelected?: boolean;
  index: number;
};

export type OpenHandsEvent = {
  channel: string;
  ts: string;
  output?: string;
  error?: string;
  code?: number;
  processKey?: string;
};

export type ProcessKey = string;
