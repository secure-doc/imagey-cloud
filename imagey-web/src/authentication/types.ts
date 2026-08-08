import { UserId } from "./UserId";

export type Kid = string;
export type EncryptedSymmetricKey = string;
export type EncryptedSharedKey = {
  issuer: UserId;
  kid: Kid;
  sharedKey: EncryptedSymmetricKey;
};
