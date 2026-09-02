// The "public-profile" Document (see docs/plans/chat-public-profile.md): the
// chat-facing counterpart to Profile. Unlike Profile, it carries no emails and
// no original-resolution picture - only what a contact is allowed to see, and
// it is shared into every chat (a keys/{contactUserId}.json entry wrapped
// under the chat's own key). `name` is optional: the document can exist with
// only an avatar (see publicProfileService.ensurePublicProfile's callers).
export interface PublicProfile {
  documentId: string;
  name?: string;
  avatarId?: string;
  key: JsonWebKey;
  // ETag the document was loaded with, sent back as If-Match on save so a
  // concurrent edit (another device) is detected rather than silently
  // overwritten.
  etag?: string;
}
