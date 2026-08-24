export interface Profile {
  name: string;
  emails: string[];
  profilePictureId?: string;
  key?: JsonWebKey;
  // ETag the profile document was loaded with, sent back as If-Match on save
  // so a concurrent edit is detected rather than silently overwritten.
  etag?: string;
}
