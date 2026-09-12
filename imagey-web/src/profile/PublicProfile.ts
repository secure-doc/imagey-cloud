import { PublicProfileMetadata } from "../document/DocumentMetadata";

// The "public-profile" Document (see docs/plans/chat-public-profile.md): the
// chat-facing counterpart to Profile. Unlike Profile, it carries no emails and
// no original-resolution picture - only what a contact is allowed to see, and
// it is shared into every chat (a keys/{contactUserId}.json entry wrapped
// under the chat's own key). A freshly created public profile has no name yet
// (see publicProfileService.createPublicProfile) - represented as "" rather
// than making `name` optional, since the one place that branches on it
// (`if (publicProfile.name)`) already treats "" as falsy correctly.
export type PublicProfile = PublicProfileMetadata;
