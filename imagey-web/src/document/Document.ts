import DocumentMetadata from "./DocumentMetadata";

// Document is a DocumentMetadata variant that has actually been
// loaded/decrypted. Generic so a caller that has already narrowed to e.g.
// FolderMetadata keeps that narrowing through Document<FolderMetadata>.
type Document<M extends DocumentMetadata = DocumentMetadata> = M;

export default Document;
