export default interface DocumentMetadata {
  documentId: string;
  name: string;
  type?: string;
  size?: number;
  smallImageId?: string;
  previewImageId?: string;
  documents?: string[];
  sharedKey?: {
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  };
}
