import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { Settings } from "../contexts/AuthenticationContext";
import {
  documentRepository,
  PreconditionFailedError,
} from "../document/DocumentRepository";
import { documentService } from "../document/DocumentService";
import { imageService } from "../image/ImageService";
import { Profile } from "./Profile";
import { PublicProfile } from "./PublicProfile";

// See docs/plans/chat-public-profile.md for the full design. The "public-profile" Document is a
// child of the private Profile (its key is wrapped under the private profile's own document key,
// kid = the private profile's documentId - the same pattern documentService.shareDocument uses for
// a chat, just self-issued instead of contact-issued) and is shared into every chat
// (see ContactService.acceptContactRequest/receiveContactRequest).
export const publicProfileService = {
  // Get-or-create (see §3.5): loads the caller's own "public-profile" Document, creating an empty
  // one - and recording its id on the private Profile - the first time this is called for them.
  // `profileId` is the private Profile's own documentId (settings.profile), needed as the "kid"
  // under which the public-profile's key for its owner is filed.
  ensurePublicProfile: async (
    userId: UserId,
    profileId: string,
    profile: Profile,
  ): Promise<{ publicProfile: PublicProfile; profile: Profile }> => {
    if (!profile.key) {
      throw new Error(
        "Cannot ensure a public profile without the private profile's key",
      );
    }
    if (profile.publicProfileId) {
      const publicProfile = await loadOwnPublicProfile(
        userId,
        profileId,
        profile,
      );
      if (!publicProfile) {
        throw new Error(
          "Failed to load existing public profile " + profile.publicProfileId,
        );
      }
      return { publicProfile, profile };
    }
    return createPublicProfile(userId, profileId, profile);
  },

  // Loads the caller's private Profile and ensures a public profile exists for them (§3.6): the
  // common first step before sending or accepting a contact request, or asking a DisplayNamePrompt
  // whether one is even needed.
  loadProfileAndEnsurePublicProfile: async (
    userId: UserId,
    settings: Pick<Settings, "profile" | "settingsKey">,
  ): Promise<{ publicProfile: PublicProfile; profile: Profile }> => {
    const profile = (await documentService.loadDocument(
      userId,
      settings.profile,
      userId,
      settings.settingsKey,
    )) as Profile;
    return publicProfileService.ensurePublicProfile(
      userId,
      settings.profile,
      profile,
    );
  },

  // Sets/updates the display name on an already-resolved public profile (e.g. from
  // ensurePublicProfile) - a lower-level building block for callers (ProfileSaveButton) that need
  // to apply more than one change to the same public profile without re-resolving it in between.
  setName: async (
    userId: UserId,
    publicProfile: PublicProfile,
    name: string,
  ): Promise<PublicProfile> => {
    const newEtag = await documentService.updateDocumentMetadata(
      userId,
      publicProfile.documentId,
      publicProfile.key,
      { type: "public-profile", name, avatarId: publicProfile.avatarId },
      publicProfile.etag,
    );
    return { ...publicProfile, name, etag: newEtag ?? undefined };
  },

  // Sets/updates the avatar on an already-resolved public profile: re-renders `picture` to the
  // fixed avatar size/format (see ImageService.renderAvatar - this also strips EXIF/GPS) and stores
  // it. See setName above re: why this takes a PublicProfile rather than ensuring one itself.
  setAvatar: async (
    userId: UserId,
    publicProfile: PublicProfile,
    picture: File,
  ): Promise<PublicProfile> => {
    const avatar = await imageService.renderAvatar(picture);
    const avatarId = await documentService.storeContent(
      userId,
      publicProfile.documentId,
      publicProfile.key,
      new File([avatar], "avatar.webp", { type: "image/webp" }),
    );
    const newEtag = await documentService.updateDocumentMetadata(
      userId,
      publicProfile.documentId,
      publicProfile.key,
      { type: "public-profile", name: publicProfile.name, avatarId },
      publicProfile.etag,
    );
    return { ...publicProfile, avatarId, etag: newEtag ?? undefined };
  },

  // Sets/updates the display name (§3.5, trigger 2): ensures a public profile exists first, and
  // leaves an existing avatar untouched. Convenience wrapper around ensurePublicProfile + setName
  // for callers (AcceptInvitationButton, useSendContactRequest, AuthenticationService) that don't
  // already have a resolved PublicProfile in hand.
  updateName: async (
    userId: UserId,
    profileId: string,
    profile: Profile,
    name: string,
  ): Promise<{ profile: Profile; publicProfile: PublicProfile }> => {
    const ensured = await publicProfileService.ensurePublicProfile(
      userId,
      profileId,
      profile,
    );
    const publicProfile = await publicProfileService.setName(
      userId,
      ensured.publicProfile,
      name,
    );
    return { profile: ensured.profile, publicProfile };
  },

  // Sets/updates the avatar (§3.5, trigger 1): ensures a public profile exists first (leaving the
  // name untouched/empty if it isn't set yet). Convenience wrapper, see updateName above.
  updateAvatar: async (
    userId: UserId,
    profileId: string,
    profile: Profile,
    picture: File,
  ): Promise<{ profile: Profile; publicProfile: PublicProfile }> => {
    const ensured = await publicProfileService.ensurePublicProfile(
      userId,
      profileId,
      profile,
    );
    const publicProfile = await publicProfileService.setAvatar(
      userId,
      ensured.publicProfile,
      picture,
    );
    return { profile: ensured.profile, publicProfile };
  },

  // Loads a contact's public profile (name + avatar) as reachable via a chat that shares it (§3.4).
  // Never rejects: a missing/inaccessible profile - no public-profile yet, or the sharing key entry
  // not filed for us yet - resolves to `undefined` so callers fall back to their own display
  // (initials), the same way documentService.loadDocument's `loadFailed` placeholder works.
  loadContactProfile: async (
    userId: UserId,
    contactUserId: UserId,
    publicProfileId: string,
    chatKey: JsonWebKey,
  ): Promise<{ name?: string; avatarBlob?: Blob } | undefined> => {
    const document = await documentService.loadDocument(
      contactUserId,
      publicProfileId,
      userId,
      chatKey,
    );
    if (document.loadFailed || !document.key) {
      return undefined;
    }
    let avatarBlob: Blob | undefined;
    if (document.avatarId) {
      try {
        const content = await documentService.loadContent(
          contactUserId,
          document,
          document.avatarId,
        );
        avatarBlob = new Blob([content]);
      } catch (e) {
        console.error("Failed to load contact avatar", e);
      }
    }
    return { name: document.name, avatarBlob };
  },
};

// Loads the owner's own copy of their public profile: its key is filed under `profileId` (the
// private Profile's own documentId), wrapped with the private profile's document key - exactly the
// shape documentService.loadDocument(user, id, parentFolderId, parentFolderKey) already resolves
// for any other folder-nested document.
async function loadOwnPublicProfile(
  userId: UserId,
  profileId: string,
  profile: Profile,
): Promise<PublicProfile | undefined> {
  if (!profile.publicProfileId || !profile.key) {
    return undefined;
  }
  const document = await documentService.loadDocument(
    userId,
    profile.publicProfileId,
    profileId,
    profile.key,
  );
  if (document.loadFailed || !document.key) {
    return undefined;
  }
  return {
    documentId: document.documentId,
    name: document.name,
    avatarId: document.avatarId,
    key: document.key,
    etag: document.etag,
  };
}

// Creates a fresh, empty public-profile Document and links it under the private Profile - one
// multipart upload creates the new document (with its owner key entry, kid = profileId) and
// updates the private profile's own content (adding publicProfileId) in the same request, exactly
// like documentService.storeDocument links a new child into a folder (see §3.5/§10: no new endpoint
// needed, the existing document/key store covers it).
async function createPublicProfile(
  userId: UserId,
  profileId: string,
  profile: Profile,
): Promise<{ publicProfile: PublicProfile; profile: Profile }> {
  if (!profile.key) {
    throw new Error(
      "Cannot create a public profile without the private profile's key",
    );
  }
  const documentId = cryptoService.generateUuid();
  const key = await cryptoService.generateSymmetricKey();
  const [encryptedContent] = await cryptoService.encryptDocument(key, [
    new TextEncoder().encode(
      JSON.stringify({ documentId, type: "public-profile" }),
    ).buffer,
  ]);
  const wrappedKey = await cryptoService.encryptKey(key, profile.key);

  const [encryptedProfileContent] = await cryptoService.encryptDocument(
    profile.key,
    [
      new TextEncoder().encode(
        JSON.stringify({
          name: profile.name,
          emails: profile.emails,
          profilePictureId: profile.profilePictureId,
          publicProfileId: documentId,
        }),
      ).buffer,
    ],
  );

  try {
    const { folderETag } = await documentRepository.uploadDocument(
      userId,
      userId,
      profileId,
      encryptedProfileContent,
      profile.etag ?? null,
      documentId,
      encryptedContent,
      { issuer: userId, kid: profileId, sharedKey: wrappedKey },
      [],
    );
    return {
      publicProfile: { documentId, key, etag: undefined },
      profile: {
        ...profile,
        publicProfileId: documentId,
        etag: folderETag ?? undefined,
      },
    };
  } catch (e) {
    if (!(e instanceof PreconditionFailedError)) {
      throw e;
    }
    // Another device won the race and already created (and linked) a public profile for this user
    // since we last read the private profile (see §3.5's race note) - adopt theirs instead of the
    // orphaned document we just created; no cleanup needed, it is simply never referenced again.
    return adoptConcurrentlyCreatedPublicProfile(
      userId,
      profileId,
      profile,
      profile.key,
      e,
    );
  }
}

async function adoptConcurrentlyCreatedPublicProfile(
  userId: UserId,
  profileId: string,
  profile: Profile,
  profileKey: JsonWebKey,
  originalError: Error,
): Promise<{ publicProfile: PublicProfile; profile: Profile }> {
  const { content, etag } = await documentRepository.loadDocument(
    userId,
    profileId,
  );
  const decrypted = await cryptoService.decryptDocument(profileKey, content);
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  const reloadedProfile: Profile = {
    ...profile,
    name: payload.name,
    emails: payload.emails ?? [],
    profilePictureId: payload.profilePictureId,
    publicProfileId: payload.publicProfileId,
    etag: etag ?? undefined,
  };
  const publicProfile = reloadedProfile.publicProfileId
    ? await loadOwnPublicProfile(userId, profileId, reloadedProfile)
    : undefined;
  if (!publicProfile) {
    throw originalError;
  }
  return { publicProfile, profile: reloadedProfile };
}
