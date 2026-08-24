import { UserId } from "../authentication/UserId";
import { MessageContent } from "../chat/Message";
import Document from "../document/Document";

export type ActivityId = string;

export type Activity =
  | InvitationActivity
  | ImageActivity
  | UploadActivity
  | NoContactsActivity;

export interface InvitationActivity {
  id: ActivityId;
  type: ActivityType.INVITATION;
  userId: UserId;
  // The inviter's public main key, carried over from the ContactRequest -
  // needed to accept without a separate public-key fetch (see
  // ContactService.acceptContactRequest).
  publicKey: JsonWebKey;
  message?: MessageContent;
}

export interface ImageActivity {
  id: ActivityId;
  type: ActivityType.IMAGE;
  image: Document;
}

export interface UploadActivity {
  id: ActivityId;
  type: ActivityType.UPLOAD;
}

export interface NoContactsActivity {
  id: ActivityId;
  type: ActivityType.NO_CONTACTS;
}

export enum ActivityType {
  INVITATION,
  IMAGE,
  UPLOAD,
  NO_CONTACTS,
}
