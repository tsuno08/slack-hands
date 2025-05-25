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
