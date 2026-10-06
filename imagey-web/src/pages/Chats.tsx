import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, useMemo } from "react";
import { NavLink } from "react-router";
import { useActionIcons } from "../contexts/ActionBarContext";
import ContactRequestDialog from "../contact/ContactRequestDialog";
import DisplayNamePrompt from "../contact/DisplayNamePrompt";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { contactService } from "../contact/ContactService";
import { ContactEntry, GroupEntry } from "../document/DocumentMetadata";
import { ContactRequest } from "../contact/ContactRequest";
import { contactDisplayName } from "../contact/contactDisplayName";
import { useInvitationInfo } from "../hooks/useInvitationInfo";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import NoContactsPanel from "../activity/NoContactsPanel";
import CreateGroupDialog from "../components/CreateGroupDialog";
import { documentService } from "../document/DocumentService";
import { publicProfileService } from "../profile/publicProfileService";
import { useReloadableLoad } from "../hooks/useReloadableLoad";
import { useSendContactRequest } from "../hooks/useSendContactRequest";
import { useSettingsKey } from "../contexts/SettingsContext";
import { notificationKeyringService } from "../notification/NotificationKeyringService";
import NotificationBanner from "../notification/NotificationBanner";

export default function Chats({ id }: { id: string }) {
  return (
    <main>
      <ChatsList id={id} showActions />
    </main>
  );
}

export function ChatsList({
  id,
  showActions = false,
  className,
  activeContactUserId,
  activeGroupId,
  onLoaded,
  onLoadError,
  registerUpdate,
}: {
  id: string;
  // Only the standalone chats page offers "add contact"/"new group" in the
  // app bar - not the sidebar list embedded in a single chat (Chat.tsx,
  // GroupChat.tsx).
  showActions?: boolean;
  className?: string;
  activeContactUserId?: string;
  activeGroupId?: string;
  // Reports the loaded "chats" document back to the caller, once known - lets
  // Chat.tsx/GroupChat.tsx reuse this fetch instead of loading the same
  // document a second time themselves: `key` resolves a chat's Document key
  // via contactService.loadChatKey, `name`/`revision` are needed to write
  // back a refreshed contact snapshot via
  // contactService.updateContactProfileSnapshot, `groups` lets GroupChat.tsx
  // find its own GroupEntry.
  onLoaded?: (chatsDocument: {
    contacts: ContactEntry[];
    groups: GroupEntry[];
    key: JsonWebKey;
    name: string;
    revision: string;
  }) => void;
  // Reports whether the "chats" document failed to load, so a caller waiting
  // on onLoaded (Chat.tsx) can show an error instead of an eternal spinner.
  onLoadError?: (failed: boolean) => void;
  // Hands the caller a function that writes a change (e.g. a newly joined
  // group) back into this list's own "chats" document state, once it exists.
  // A caller that instead kept its own copy of the document (from onLoaded)
  // and patched only that copy would fork the two: this list's next
  // unrelated state change (a contact request being picked up, a profile
  // sync) re-publishes via onLoaded and overwrites the caller's patch with
  // this list's older state.
  registerUpdate?: (
    update: (
      list: { contacts: ContactEntry[]; groups: GroupEntry[] },
      revision: string | null,
    ) => void,
  ) => void;
}) {
  const { i18n } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs?.mainKeyPair;
  const settings = authentication.settings;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>();
  const [chatsDocument, setChatsDocument] = useState<{
    contacts: ContactEntry[];
    groups: GroupEntry[];
    key: JsonWebKey;
    name: string;
    revision: string;
  }>();
  const settingsKey = useSettingsKey();
  const { requestContact, namePrompt, confirmDisplayName, cancelDisplayName } =
    useSendContactRequest(
      user,
      authentication.email,
      mainKeyPair,
      settings,
      () => setIsDialogOpen(false),
    );

  const actionIcons = useMemo(
    () =>
      showActions
        ? [
            <button
              key="add-contact"
              className="circle transparent"
              onClick={() => setIsDialogOpen(true)}
            >
              <i>add</i>
            </button>,
            <button
              key="new-group"
              className="circle transparent"
              onClick={() => setIsGroupDialogOpen(true)}
            >
              <i>group_add</i>
            </button>,
          ]
        : [],
    [showActions],
  );
  useActionIcons(actionIcons);

  // A failed load rejects (documentService.DocumentLoadError); without
  // catching that, a transient 5xx would leave the list silently empty
  // forever (onLoaded is skipped, Chat.tsx spins). Report it up and retry on
  // a short timer.
  const { failed: chatsLoadFailed } = useReloadableLoad(async () => {
    contactRepository
      .getContactRequests(user)
      .then((contactRequests) => setContactRequests(contactRequests))
      .catch((e) => console.error("Failed to fetch contact requests", e));

    try {
      const loaded = await documentService.loadDocument(
        user,
        id,
        user,
        settingsKey,
      );
      if (loaded.type !== "chatList") {
        throw new Error(
          `Expected the chats document to be a chatList, got ${loaded.type}`,
        );
      }
      onLoadError?.(false);
      setChatsDocument({
        contacts: loaded.contacts,
        groups: loaded.groups ?? [],
        key: loaded.key,
        name: loaded.name,
        revision: loaded.revision,
      });
      const deviceKeyPair = authentication.keyPairs?.deviceKeyPair;
      if (deviceKeyPair) {
        const list = { contacts: loaded.contacts, groups: loaded.groups ?? [] };
        // Only issues extra requests while push is active on this device
        // (isActive/fillMissing) - a plain load never triggers them, so
        // existing tests without push stay unaffected.
        notificationKeyringService
          .rememberNames(user, deviceKeyPair, loaded.contacts)
          .then(() =>
            notificationKeyringService.fillMissing(
              user,
              deviceKeyPair,
              list,
              id,
              loaded.key,
            ),
          )
          .catch((e) =>
            console.warn("Failed to refresh the notification keyring", e),
          );
      }
      return true;
    } catch (e) {
      console.error("Failed to load chats document", e);
      onLoadError?.(true);
      throw e;
    }
  }, [user, id, settingsKey]);

  // Re-publish to onLoaded whenever the chats document changes - not just on
  // the first load - so a contact added afterwards (an accepted invitation, or
  // the inviter picking up an ACCEPTED request via receiveContactRequest) is
  // immediately reachable in Chat.tsx instead of only after a full reload.
  useEffect(() => {
    if (chatsDocument) {
      onLoaded?.(chatsDocument);
    }
  }, [chatsDocument, onLoaded]);

  useEffect(() => {
    registerUpdate?.((list, revision) =>
      setChatsDocument((prev) =>
        prev
          ? {
              ...prev,
              contacts: list.contacts,
              groups: list.groups,
              revision: revision ?? prev.revision,
            }
          : prev,
      ),
    );
  }, [registerUpdate]);

  // The inviter's side of the handshake (leg 3, ADR 0015): once the invitee
  // has ACCEPTED the request, derive the chat key, create the chat Document
  // together with the contact entry, and confirm receipt so the server files
  // the invitee's key entry under the chat.
  //
  // receiveContactRequest is a read-modify-write of the chats document plus a
  // receipt confirmation - running it twice for the same request (StrictMode's
  // double-invoke, or any re-render before the .then() prunes contactRequests)
  // risks appending the same contact twice on an unlucky interleaving. This
  // ref tracks the (inviter:invitee) pairs already being processed so a second
  // pass skips them; it survives re-renders but resets on a real remount.
  const receivingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!settings || !mainKeyPair) {
      return;
    }
    const acceptedRequests = (contactRequests ?? []).filter(
      (request) => request.inviter === user && request.status === "ACCEPTED",
    );
    acceptedRequests.forEach((request) => {
      const requestKey = `${request.inviter}:${request.invitee}`;
      if (receivingRef.current.has(requestKey)) {
        return;
      }
      receivingRef.current.add(requestKey);
      publicProfileService
        .loadProfileAndEnsurePublicProfile(user, settings)
        .then(({ publicProfile }) =>
          contactService.receiveContactRequest(
            user,
            request,
            publicProfile,
            settings,
            mainKeyPair,
          ),
        )
        .then((newContact) => {
          setContactRequests((prev) =>
            prev?.filter(
              (r) =>
                !(
                  r.inviter === request.inviter && r.invitee === request.invitee
                ),
            ),
          );
          setChatsDocument((prev) =>
            prev
              ? {
                  ...prev,
                  // A retried pick-up returns the already recorded contact.
                  contacts: prev.contacts
                    .filter((c) => c.chatId !== newContact.chatId)
                    .concat(newContact),
                }
              : prev,
          );
        })
        .catch((e) => {
          // Let a genuine retry happen after a transient failure.
          receivingRef.current.delete(requestKey);
          console.error("Failed to receive contact request", e);
        });
    });
  }, [contactRequests, user, settings, mainKeyPair]);

  // Invitations still awaiting our decision, addressed to us.
  const openInvitations = (contactRequests ?? []).filter(
    (request) => request.invitee === user && request.status === "INVITED",
  );

  return (
    <section
      className={
        className ? className + " col scroll s12 m4 l4" : "col scroll s12 m4 l4"
      }
      style={
        activeContactUserId
          ? { borderRight: "1px solid var(--surface-variant)" }
          : undefined
      }
    >
      <NotificationBanner />
      {chatsLoadFailed && (
        <div className="padding">
          {i18n.t("Could not load your chats. Retrying...")}
        </div>
      )}
      {(chatsDocument?.contacts && chatsDocument.contacts.length > 0) ||
      (chatsDocument?.groups && chatsDocument.groups.length > 0) ||
      openInvitations.length > 0 ? (
        <ul className="list border">
          {chatsDocument?.groups &&
            chatsDocument.groups.map((group) => (
              <li key={`group-${group.groupId}`}>
                <NavLink
                  to={`/chats/groups/${group.groupId}`}
                  className={({ isActive }) =>
                    isActive || group.groupId === activeGroupId
                      ? "active surface-variant"
                      : ""
                  }
                >
                  <button className="circle transparent">
                    <i>group</i>
                  </button>
                  <div className="max">
                    <h6 className="small">{group.name}</h6>
                  </div>
                </NavLink>
              </li>
            ))}
          {openInvitations.map((contactRequest, index) => (
            <InvitationListItem
              key={index}
              user={user}
              contactRequest={contactRequest}
              onAccepted={(newContact) => {
                setContactRequests((contactRequests) =>
                  contactRequests?.filter(
                    (request) => request.inviter !== contactRequest.inviter,
                  ),
                );
                setChatsDocument((prev) =>
                  prev
                    ? {
                        ...prev,
                        contacts: prev.contacts.concat(newContact),
                      }
                    : prev,
                );
              }}
              onDeclined={() =>
                setContactRequests((contactRequests) =>
                  contactRequests?.filter(
                    (request) => request.inviter !== contactRequest.inviter,
                  ),
                )
              }
            />
          ))}
          {chatsDocument?.contacts &&
            chatsDocument.contacts.map((contact, index) => {
              const displayName = contactDisplayName(
                contact.userId,
                contact,
                i18n.t("Unknown contact"),
              );
              return (
                <li key={index + openInvitations.length}>
                  <NavLink
                    to={`/chats/${contact.userId}`}
                    className={({ isActive }) =>
                      isActive ? "active surface-variant" : ""
                    }
                  >
                    <button className="circle transparent">
                      {displayName.charAt(0).toLocaleUpperCase()}
                    </button>
                    <div className="max">
                      <h6 className="small">{displayName}</h6>
                      {contact.email && contact.email !== displayName && (
                        <div>{contact.email}</div>
                      )}
                    </div>
                    <label>
                      {new Date().toLocaleDateString(i18n.language)}
                    </label>
                  </NavLink>
                </li>
              );
            })}
        </ul>
      ) : (
        <NoContactsPanel className="s12" />
      )}

      {isDialogOpen && (
        <ContactRequestDialog
          onConfirm={(email) => {
            // Close now - a DisplayNamePrompt (§3.6) may open right behind
            // it, and the two must not show at the same time.
            setIsDialogOpen(false);
            requestContact(email);
          }}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
      {namePrompt && (
        <DisplayNamePrompt
          onConfirm={confirmDisplayName}
          onCancel={cancelDisplayName}
        />
      )}
      {isGroupDialogOpen && chatsDocument && (
        <CreateGroupDialog
          contacts={chatsDocument.contacts}
          chatsDocument={{
            documentId: id,
            name: chatsDocument.name,
            key: chatsDocument.key,
            revision: chatsDocument.revision,
            contacts: chatsDocument.contacts,
            groups: chatsDocument.groups,
          }}
          chatsId={id}
          onClose={() => setIsGroupDialogOpen(false)}
          onCreated={(list, revision) =>
            // The dialog only renders while chatsDocument is set (see the
            // guard above), so it's always defined here too.
            setChatsDocument((prev) => ({
              ...prev!,
              contacts: list.contacts,
              groups: list.groups,
              revision: revision ?? prev!.revision,
            }))
          }
        />
      )}
    </section>
  );
}

// An invitation still awaiting our decision - the inviter's name/address come
// from the request itself (see ContactRequest.contactInfo), since their
// public profile is not reachable before accepting.
function InvitationListItem({
  user,
  contactRequest,
  onAccepted,
  onDeclined,
}: {
  user: string;
  contactRequest: ContactRequest;
  onAccepted: (contact: ContactEntry) => void;
  onDeclined: () => void;
}) {
  const { t } = useTranslation();
  const inviterInfo = useInvitationInfo(contactRequest);
  const displayName = contactDisplayName(
    contactRequest.inviter,
    inviterInfo,
    t("Unknown contact"),
  );
  return (
    <li>
      <button className="circle">
        {displayName.charAt(0).toLocaleUpperCase()}
      </button>
      <div className="max">
        <h6 className="small">{displayName}</h6>
        {inviterInfo.email && inviterInfo.email !== displayName && (
          <div>{inviterInfo.email}</div>
        )}
      </div>
      <div>
        <AcceptInvitationButton
          user={user}
          invitation={contactRequest}
          onAccepted={onAccepted}
        />
        <DeclineInvitationButton
          user={user}
          contact={contactRequest.inviter}
          onDeclined={onDeclined}
        />
      </div>
    </li>
  );
}
