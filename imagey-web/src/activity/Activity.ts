import { ContactRequest } from "../contact/ContactRequest";
import { MessageContent } from "../chat/Message";
import { NewDocumentMetadata } from "../document/DocumentMetadata";

export type ActivityId = string;

export type Activity =
  | InvitationActivity
  | ImageActivity
  | UploadActivity
  | NoContactsActivity;

export interface InvitationActivity {
  id: ActivityId;
  type: ActivityType.INVITATION;
  // The INVITED request itself - carries everything needed to show (the
  // inviter's encrypted name/address) and accept it (their public main key,
  // the chat id they chose, their public-profile id) without further fetches.
  request: ContactRequest;
  message?: MessageContent;
}

export interface ImageActivity {
  id: ActivityId;
  type: ActivityType.IMAGE;
  // Either an already-loaded Document (from loadFolderChildren) or a
  // freshly-uploaded NewDocumentMetadata (from UploadPanel's onUploadComplete,
  // whose own revision is not known yet) - see document/DocumentMetadata.ts.
  image: NewDocumentMetadata & { content?: ArrayBuffer };
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
