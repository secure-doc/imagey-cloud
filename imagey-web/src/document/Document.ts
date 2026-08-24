import DocumentMetadata from "./DocumentMetadata";

// Document is a DocumentMetadata that has actually been loaded/decrypted:
// it carries everything DocumentMetadata does (size, contentId, sharedKey,
// ETag, etc.) plus the fields only meaningful once loaded (raw content).
export default interface Document extends DocumentMetadata {
  content?: ArrayBuffer;
  profilePictureId?: string;
}
