import { EncryptedKey } from "../authentication/CryptoService";

export type ContactExchange = {
  inviter: string;
  invitee: string;
  status: "INVITED" | "DENIED";
  publicKey?: JsonWebKey | null;
  documentId?: string | null;
  sharedKey?: EncryptedKey | null;
};
