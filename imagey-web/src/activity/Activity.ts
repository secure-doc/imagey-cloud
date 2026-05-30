import Document from "../document/Document";

export type Activity = InvitationActivity | ImageActivity | UploadActivity;

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

export enum ActivityType {
  INVITATION,
  IMAGE,
  UPLOAD,
}
