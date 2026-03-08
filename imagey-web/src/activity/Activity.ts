import Document from "../document/Document";

export type Activity = InvitationActivity | ImageActivity | UploadActivity;

export interface InvitationActivity {
  type: ActivityType.INVITATION;
  userName: string;
  message?: string;
}

export interface ImageActivity {
  type: ActivityType.IMAGE;
  image: Document;
}

export interface UploadActivity {
  type: ActivityType.UPLOAD;
}

export enum ActivityType {
  INVITATION,
  IMAGE,
  UPLOAD,
}
