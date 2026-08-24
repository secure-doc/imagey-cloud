import { UserId } from "../authentication/UserId";

export type Contact = {
  userId: UserId;
  chatId: string;
  // The user who created the chat's Document (self-issued its key when
  // uploading it) - the other party only has an ECDH-wrapped copy shared
  // with them during the accept step. Needed to know how to unwrap the
  // chat Document's key: symmetrically (via the "chats" document's own
  // key) if we're the owner, or via ECDH (with the owner's public key) if
  // we're not. See ContactService.loadChatKey.
  owner: UserId;
};
