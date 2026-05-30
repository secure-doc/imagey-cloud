import Document from "../document/Document";

export type Activity =
  | InvitationActivity
  | ImageActivity
  | UploadActivity
  | NoContactsActivity;

export interface InvitationActivity {
  id: string;
  type: ActivityType.INVITATION;
  userName: string;
  message?: string;
}

export interface ImageActivity {
  id: string;
  type: ActivityType.IMAGE;
  image: Document;
}

export interface UploadActivity {
  id: string;
  type: ActivityType.UPLOAD;
}

export interface NoContactsActivity {
  id: string;
  type: ActivityType.NO_CONTACTS;
}

export enum ActivityType {
  INVITATION,
  IMAGE,
  UPLOAD,
  NO_CONTACTS,
}
