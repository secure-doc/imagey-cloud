import { UserId } from "../authentication/UserId";
import { EncryptedSharedKey } from "../contexts/AuthenticationContext";

export type Contact = {
  userId: UserId;
};
export type SharedKey = {
  issuer: UserId;
  kid: "0";
  sharedKey: EncryptedSharedKey;
};
export type ContactKeys = {
  userKey: SharedKey;
  contactKey: SharedKey;
};
