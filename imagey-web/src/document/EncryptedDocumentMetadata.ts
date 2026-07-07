export default interface EncryptedDocumentMetadata {
  documentId: string;
  metadata: string;
  sharedKey: { issuer: string; kid: string; sharedKey: string };
}
