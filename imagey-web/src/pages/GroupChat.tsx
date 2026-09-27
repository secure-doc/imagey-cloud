import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import {
  useActionIcons,
  useBackButton,
  useTitle,
} from "../contexts/ActionBarContext";
import { documentService } from "../document/DocumentService";
import { groupService, loadGroupContent } from "../contact/GroupService";
import { ConversationView } from "../chat/ConversationView";
import { usePolling } from "../chat/messageHooks";
import { ChatsList } from "./Chats";
import { useChatsId } from "../contexts/SettingsContext";
import { ContactEntry, GroupEntry } from "../document/DocumentMetadata";
import { useGroupMemberProfiles } from "../hooks/useGroupMemberProfiles";
import AddGroupMemberDialog from "../components/AddGroupMemberDialog";
import { contactDisplayName } from "../contact/contactDisplayName";

// A group's own conversation (ADR 0019): structurally the 1:1 chat view
// (Chat.tsx) with three differences - the group key comes from either the
// owner's self-issued entry or a member's cached GroupEntry.groupKey instead
// of ContactService.loadChatKey, a shared image is reached via an Access-Path
// instead of a direct grant (ConversationView's `group` prop), and every
// message needs a sender label since a group has more than one counterpart.
export default function GroupChat({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const chatsId = useChatsId();

  const [chatsDocumentInfo, setChatsDocumentInfo] = useState<{
    contacts: ContactEntry[];
    groups: GroupEntry[];
    chatsDocumentKey: JsonWebKey;
    name: string;
    revision: string;
  }>();
  const [chatsLoadFailed, setChatsLoadFailed] = useState(false);

  const [group, setGroup] = useState<{
    ownerId: string;
    key: JsonWebKey;
    name: string;
    members: string[];
    publicProfiles: Record<string, string>;
    revision: string | null;
  }>();
  const [loadError, setLoadError] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const { messages, setMessages } = usePolling(
    user,
    group?.ownerId,
    groupId,
    group?.key,
  );

  useBackButton();

  const handleChatsListLoaded = useCallback(
    (chatsDocument: {
      contacts: ContactEntry[];
      groups: GroupEntry[];
      key: JsonWebKey;
      name: string;
      revision: string;
    }) =>
      setChatsDocumentInfo({
        contacts: chatsDocument.contacts,
        groups: chatsDocument.groups,
        chatsDocumentKey: chatsDocument.key,
        name: chatsDocument.name,
        revision: chatsDocument.revision,
      }),
    [],
  );

  // The group key: the owner's own tree files it self-issued under the
  // "chats" document (same shape as a chat Document's owner side); a member
  // already cached it in their GroupEntry at join time (ADR 0019 decision 3),
  // no network round-trip needed. Either way, the rest of the metadata
  // (name/members/publicProfiles) is then loaded directly with that key.
  useEffect(() => {
    if (!chatsDocumentInfo) {
      return;
    }
    const entry = chatsDocumentInfo.groups.find((g) => g.groupId === groupId);
    if (!entry) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    let cancelled = false;
    const isOwner = entry.owner === user;
    (async () => {
      try {
        // The owner's own load already returns the full decrypted metadata
        // (documentService.loadDocument fetches content and key together) -
        // a member instead already holds the key (no key entry to look up)
        // and needs loadGroupContent's direct content-only fetch instead.
        if (isOwner) {
          const doc = await documentService.loadDocument(
            user,
            groupId,
            chatsId,
            chatsDocumentInfo.chatsDocumentKey,
          );
          if (doc.type !== "group") {
            throw new Error(`Expected a group document, got ${doc.type}`);
          }
          if (!cancelled) {
            setGroup({
              ownerId: entry.owner,
              key: doc.key,
              name: doc.name,
              members: doc.members,
              publicProfiles: doc.publicProfiles,
              revision: doc.revision,
            });
          }
          return;
        }
        if (!entry.groupKey) {
          throw new Error("Missing cached group key for a non-owned group");
        }
        const content = await loadGroupContent(
          entry.owner,
          groupId,
          entry.groupKey,
        );
        if (!cancelled) {
          setGroup({
            ownerId: entry.owner,
            key: entry.groupKey,
            name: content.metadata.name,
            members: content.metadata.members,
            publicProfiles: content.metadata.publicProfiles,
            revision: content.revision,
          });
        }
      } catch (e) {
        console.error("Failed to load group", e);
        if (!cancelled) {
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatsDocumentInfo, groupId, user, chatsId]);

  useTitle(group?.name ?? "", "");

  const memberProfiles = useGroupMemberProfiles(
    user,
    group?.ownerId ?? "",
    groupId,
    group?.key,
    group?.publicProfiles,
  );

  const isOwner = !!group && group.ownerId === user;
  const actionIcons = useMemo(
    () =>
      isOwner
        ? [
            <button
              key="add-member"
              className="circle transparent"
              onClick={() => setShowAddMember(true)}
            >
              <i>person_add</i>
            </button>,
          ]
        : [],
    [isOwner],
  );
  useActionIcons(actionIcons);

  const memberLabel = useCallback(
    (memberId: string) =>
      memberProfiles[memberId]?.name ||
      contactDisplayName(memberId, {}, t("Unknown member")),
    [memberProfiles, t],
  );

  return (
    <main className="grid no-margin no-space no-padding">
      <ChatsList
        id={chatsId}
        className="m l"
        activeGroupId={groupId}
        onLoaded={handleChatsListLoaded}
        onLoadError={setChatsLoadFailed}
      />
      <div
        className="col s12 m8 l8 vertical"
        style={{
          height: "calc(100vh - 64px)",
        }}
      >
        {chatsLoadFailed ? (
          <div className="padding">
            {t("Could not load your chats. Retrying...")}
          </div>
        ) : loadError ? (
          <div className="padding">{t("Error loading this group")}</div>
        ) : messages === undefined || !group ? (
          <div className="max flex center-align middle-align">
            <progress className="circle"></progress>
          </div>
        ) : (
          <ConversationView
            userId={user}
            ownerId={group.ownerId}
            chatId={groupId}
            sharedKey={group.key}
            messages={messages}
            onMessageSent={(newMessage) =>
              setMessages((prev) => [...(prev ?? []), newMessage])
            }
            share={(document) =>
              groupService.shareDocumentIntoGroup(
                user,
                document,
                group.ownerId,
                groupId,
                group.key,
              )
            }
            group={{
              groupId,
              groupOwnerId: group.ownerId,
              groupKey: group.key,
            }}
            renderSender={(senderId) => (
              <div
                style={{
                  fontSize: "0.75rem",
                  opacity: 0.7,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                {memberProfiles[senderId]?.avatarUrl && (
                  <img
                    src={memberProfiles[senderId]?.avatarUrl}
                    alt=""
                    className="circle"
                    style={{ width: "1.25rem", height: "1.25rem" }}
                  />
                )}
                {memberLabel(senderId)}
              </div>
            )}
          />
        )}
      </div>
      {showAddMember && group && chatsDocumentInfo && (
        <AddGroupMemberDialog
          contacts={chatsDocumentInfo.contacts}
          chatsId={chatsId}
          chatsDocumentKey={chatsDocumentInfo.chatsDocumentKey}
          group={{
            documentId: groupId,
            key: group.key,
            revision: group.revision,
            name: group.name,
            members: group.members,
            publicProfiles: group.publicProfiles,
          }}
          onClose={() => setShowAddMember(false)}
          onAdded={(updated) =>
            setGroup((prev) =>
              prev
                ? {
                    ...prev,
                    members: updated.members,
                    publicProfiles: updated.publicProfiles,
                    revision: updated.revision,
                  }
                : prev,
            )
          }
        />
      )}
    </main>
  );
}
