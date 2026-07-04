export default interface EncryptedDocumentMetadata {
  documentId: string;
  metadata: string;
  sharedKey: {
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  };
}
