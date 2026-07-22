import { UserId } from "../authentication/UserId";

export type Contact = {
  userId: UserId;
  documentId: string;
  key: JsonWebKey;
};
