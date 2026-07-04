export default interface Document {
  name: string;
  type?: string;
  documentId: string;
  content?: ArrayBuffer;
  key?: JsonWebKey;
  etag?: string;
  documents?: string[];
}
