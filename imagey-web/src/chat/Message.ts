import { UserId } from "../authentication/UserId";

export type IssuerId = UserId | ChatId;
export type ChatId = string;
export type MessageContent = string;
export interface Message {
  id: ChatId;
  sender: UserId;
  content: MessageContent;
  // ISO-8601 (UTC), stamped by the server (ADR 0021).
  timestamp: string;
}
