import { WebClient } from "@slack/web-api";

export class SlackUtils {
  static formatCodeBlock = (content: string, language: string = ""): string => {
    return `\`\`\`${language}\n${content}\n\`\`\``;
  };

  static truncateOutput = (
    output: string,
    maxLength: number = 2900
  ): string => {
    if (output.length <= maxLength) {
      return output;
    }
    return "...\n" + output.slice(-(maxLength - 10));
  };

  static extractMentionText = (text: string): string => {
    // ボットメンションとユーザーメンションを除去
    return text
      .replace(/<@[UW][A-Z0-9]+>/g, "") // ユーザー・ボットメンション
      .replace(/<#[A-Z0-9]+\|[^>]+>/g, "") // チャンネルメンション
      .replace(/<!here>/g, "") // @here
      .replace(/<!channel>/g, "") // @channel
      .trim();
  };

  static isDirectMessage = (channelType: string): boolean => {
    return channelType === "im";
  };

  static createThreadReply = async (
    client: WebClient,
    channel: string,
    threadTs: string,
    text: string
  ): Promise<void> => {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
    });
  };

  static createEphemeralMessage = async (
    client: WebClient,
    channel: string,
    user: string,
    text: string
  ): Promise<void> => {
    await client.chat.postEphemeral({
      channel,
      user,
      text,
    });
  };
}
