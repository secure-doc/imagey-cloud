export default interface Document {
  name: string;
  type?: string;
  documentId: string;
  content?: ArrayBuffer;
  issuer?: string;
  documentIds?: string[];
  folderIds?: string[];
  _metadata?: any; // Internal metadata for patches
}
