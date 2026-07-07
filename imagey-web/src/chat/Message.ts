import { UserId } from "../authentication/UserId";

export type IssuerId = UserId | ChatId;
export type ChatId = string;
export type MessageContent = string;
export interface Message {
  id: ChatId;
  sender: UserId;
  content: MessageContent;
}
