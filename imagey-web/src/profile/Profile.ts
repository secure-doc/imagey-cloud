export interface Profile {
  name: string;
  emails: string[];
  profilePictureId?: string;
  key?: JsonWebKey;
  // ETag the profile document was loaded with, sent back as If-Match on save
  // so a concurrent edit is detected rather than silently overwritten.
  etag?: string;
  // The id of this user's "public-profile" Document (see
  // docs/plans/chat-public-profile.md) - the chat-facing name/avatar shared
  // with contacts. Absent until publicProfileService.ensurePublicProfile
  // creates one for the first time.
  publicProfileId?: string;
}
