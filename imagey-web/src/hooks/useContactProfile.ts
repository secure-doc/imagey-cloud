import { useEffect, useState } from "react";
import { UserId } from "../authentication/UserId";
import { publicProfileService } from "../profile/publicProfileService";
import { useObjectUrl } from "./useObjectUrl";

// Resolves a contact's chat-facing display name/avatar (see
// docs/plans/chat-public-profile.md §3.4), given the chat key and the
// contact's "public-profile" Document id already resolved from the chat's
// own metadata (see ContactService.loadChatKey). Never surfaces an error:
// a missing/inaccessible profile - no public-profile yet, or the sharing key
// not filed for us yet - simply resolves to an empty name/avatar, so callers
// fall back to their own display (e.g. the contact's userId/initial).
export function useContactProfile(
  user: UserId,
  contactUserId: string | undefined,
  publicProfileId: string | undefined,
  chatKey: JsonWebKey | undefined,
): { name?: string; avatarUrl?: string } {
  const [profile, setProfile] = useState<{
    name?: string;
    avatarBlob?: Blob;
  }>();
  const avatarUrl = useObjectUrl(profile?.avatarBlob);

  useEffect(() => {
    setProfile(undefined);
    if (!contactUserId || !publicProfileId || !chatKey) {
      return;
    }
    let cancelled = false;
    publicProfileService
      .loadContactProfile(user, contactUserId, publicProfileId, chatKey)
      .then((loaded) => {
        if (!cancelled) {
          setProfile(loaded);
        }
      })
      .catch((e) => console.error("Failed to load contact profile", e));
    return () => {
      cancelled = true;
    };
  }, [user, contactUserId, publicProfileId, chatKey]);

  // Treat a blank/whitespace-only name as "no name" so callers fall back to
  // the contact's userId/initial instead of rendering an empty label.
  const name = profile?.name?.trim() || undefined;
  return { name, avatarUrl };
}
