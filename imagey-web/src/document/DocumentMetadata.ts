import { Contact } from "../contact/Contact";

export default interface DocumentMetadata {
  documentId: string;
  name: string;
  // The account whose tree this document lives in (stamped by
  // documentService.loadDocument). Differs from the viewer for a document
  // seen via a chat share; used to build content-fetch URLs.
  owner?: string;
  type?: string;
  size?: number;
  contentId?: string;
  smallImageId?: string;
  previewImageId?: string;
  documents?: string[];
  // Set by documentService.loadDocument when the document could NOT be fetched
  // or decrypted. Such a result is a placeholder for display only - it has no
  // `key`, `documents` or `etag` - and MUST NOT be used as the read-modify-write
  // base for a folder/chats update (that would persist an empty child list and
  // drop every existing entry).
  loadFailed?: boolean;
  // ETag the document was loaded with (documentService.loadDocument). Sent back
  // as a precondition on the next read-modify-write of this document so a
  // concurrent change is detected instead of silently overwritten.
  etag?: string;
  sharedKey?: {
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  };
  emails?: string[];
  key?: JsonWebKey;
  // Present on the "chats" document: the user's contacts, each paired
  // with the id of the (also encrypted) chat Document they now share.
  contacts?: Contact[];
}
