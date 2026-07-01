export default interface DocumentMetadata {
  name?: string;
  type?: string;
  size?: number;
  documentId: string;
  smallImageId?: string;
  previewImageId?: string;
  encryptedData?: string;
  sharedKey?: { issuer: string; kid: string; sharedKey: string };
}
