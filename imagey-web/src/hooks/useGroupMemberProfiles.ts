import { useEffect, useRef, useState } from "react";
import { UserId } from "../authentication/UserId";
import { buildGroupAccessPath } from "../contexts/FolderContext";
import { publicProfileService } from "../profile/publicProfileService";

export interface GroupMemberProfile {
  name?: string;
  avatarUrl?: string;
}

// Resolves every OTHER group member's chat-facing name/avatar (ADR 0019
// decision 4/§8): each member's public profile is shared into the group with
// one key entry (not one per reader), so it is reached via a two-hop Access-
// Path (FolderContext.buildGroupAccessPath) instead of the 1:1 direct grant
// useContactProfile relies on - hence a dedicated hook rather than one
// useContactProfile call per member (a variable-length list of hooks is not
// allowed anyway). Like useContactProfile, never surfaces an error: a member
// with no shared profile yet simply has no entry, so callers fall back to
// "Unknown member".
export function useGroupMemberProfiles(
  userId: UserId,
  groupOwnerId: string,
  groupId: string,
  groupKey: JsonWebKey | undefined,
  publicProfiles: Record<string, string> | undefined,
): Record<string, GroupMemberProfile> {
  const [profiles, setProfiles] = useState<Record<string, GroupMemberProfile>>(
    {},
  );
  // The object URLs currently referenced by `profiles` - kept outside state
  // so they can be revoked exactly once, right when they stop being
  // displayed (replaced by a new batch, or the hook unmounting), rather than
  // by the effect cleanup below, which fires as soon as membersKey changes
  // and would otherwise invalidate the still-rendered <img> srcs before the
  // replacement avatars have loaded.
  const activeUrlsRef = useRef<string[]>([]);

  // Stable across re-renders that don't actually change the member list, so
  // the effect below doesn't re-fetch on every unrelated parent re-render.
  const membersKey = publicProfiles
    ? Object.entries(publicProfiles)
        .filter(([memberId]) => memberId !== userId)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([memberId, ppId]) => `${memberId}:${ppId}`)
        .join(",")
    : "";

  useEffect(() => {
    if (!groupKey || !membersKey) {
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      activeUrlsRef.current = [];
      setProfiles({});
      return;
    }
    let cancelled = false;
    Promise.all(
      membersKey.split(",").map(async (entry) => {
        const [memberId, publicProfileId] = entry.split(":");
        const accessPath = buildGroupAccessPath(
          userId,
          publicProfileId,
          memberId,
          groupId,
          groupOwnerId,
        );
        const loaded = await publicProfileService.loadContactProfile(
          userId,
          memberId,
          publicProfileId,
          groupKey,
          accessPath,
          groupId,
        );
        if (!loaded) {
          return [memberId, {} as GroupMemberProfile] as const;
        }
        const avatarUrl = loaded.avatarBlob
          ? URL.createObjectURL(loaded.avatarBlob)
          : undefined;
        return [
          memberId,
          { name: loaded.name?.trim() || undefined, avatarUrl },
        ] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) {
          // Nobody will ever render these URLs - the member list moved on, or
          // the hook unmounted, while this batch was still loading. Some of
          // them may have been created well before cancellation (an early
          // member's profile finished while a later one was still pending) -
          // revoking only the ones created after the flip would leak those.
          entries.forEach(([, profile]) => {
            if (profile.avatarUrl) {
              URL.revokeObjectURL(profile.avatarUrl);
            }
          });
          return;
        }
        // Only now do the new avatars replace the old ones on screen, so only
        // now is it safe to release the old URLs.
        activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        activeUrlsRef.current = entries
          .map(([, profile]) => profile.avatarUrl)
          .filter((url): url is string => !!url);
        setProfiles(Object.fromEntries(entries));
      })
      .catch((e) => console.error("Failed to load group member profiles", e));
    return () => {
      cancelled = true;
    };
  }, [userId, groupOwnerId, groupId, groupKey, membersKey]);

  // Release whichever URLs are currently displayed once the hook itself goes
  // away - a per-run effect cleanup above would revoke them as soon as
  // membersKey changes, before the replacement avatars are ready.
  useEffect(() => {
    return () => {
      activeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return profiles;
}
