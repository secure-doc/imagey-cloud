import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, useMemo } from "react";
import { NavLink } from "react-router";
import { useActionIcons } from "../contexts/ActionBarContext";
import ContactRequestDialog from "../contact/ContactRequestDialog";
import DisplayNamePrompt from "../contact/DisplayNamePrompt";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { contactService } from "../contact/ContactService";
import { Contact } from "../contact/Contact";
import { ContactRequest } from "../contact/ContactRequest";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import NoContactsPanel from "../activity/NoContactsPanel";
import { documentService } from "../document/DocumentService";
import { publicProfileService } from "../profile/publicProfileService";
import { useReloadableLoad } from "../hooks/useReloadableLoad";
import { useSendContactRequest } from "../hooks/useSendContactRequest";
import { useSettingsKey } from "../contexts/SettingsContext";

export default function Chats({ id }: { id: string }) {
  return (
    <main>
      <ChatsList id={id} />
    </main>
  );
}

export function ChatsList({
  id,
  className,
  activeContactUserId,
  onLoaded,
  onLoadError,
}: {
  id: string;
  className?: string;
  activeContactUserId?: string;
  // Reports the loaded contacts and the "chats" document's own key back to
  // the caller, once known - lets Chat.tsx reuse this fetch instead of
  // loading the same chats document a second time itself (it needs both to
  // resolve a chat's Document key via contactService.loadChatKey).
  onLoaded?: (contacts: Contact[], chatsDocumentKey: JsonWebKey) => void;
  // Reports whether the "chats" document failed to load, so a caller waiting
  // on onLoaded (Chat.tsx) can show an error instead of an eternal spinner.
  onLoadError?: (failed: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs?.mainKeyPair;
  const settings = authentication.settings;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [chatsDocumentKey, setChatsDocumentKey] = useState<JsonWebKey>();
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
    () => [
      <button
        key="add-contact"
        className="circle transparent"
        onClick={() => setIsDialogOpen(true)}
      >
        <i>add</i>
      </button>,
    ],
    [],
  );
  useActionIcons(actionIcons);

  // loadDocument never rejects - a failed fetch/decrypt comes back as a
  // `loadFailed` placeholder. Without noticing that, a transient 5xx would
  // leave the list silently empty forever (onLoaded is skipped, Chat.tsx
  // spins). Report it up and retry on a short timer.
  const { failed: chatsLoadFailed } = useReloadableLoad(async () => {
    contactRepository
      .getContactRequests(user)
      .then((contactRequests) => setContactRequests(contactRequests))
      .catch((e) => console.error("Failed to fetch contact requests", e));

    const chatsDocument = await documentService.loadDocument(
      user,
      id,
      user,
      settingsKey,
    );
    if (chatsDocument.loadFailed || !chatsDocument.key) {
      console.error("Failed to load chats document");
      onLoadError?.(true);
      return false;
    }
    onLoadError?.(false);
    setContacts(chatsDocument.contacts ?? []);
    setChatsDocumentKey(chatsDocument.key);
    return true;
  }, [user, id, settingsKey]);

  // Re-publish to onLoaded whenever the contacts list changes - not just on the
  // first load - so a contact added afterwards (an accepted invitation, or the
  // inviter picking up an ACCEPTED request via receiveContactRequest) is
  // immediately reachable in Chat.tsx instead of only after a full reload.
  useEffect(() => {
    if (chatsDocumentKey && contacts) {
      onLoaded?.(contacts, chatsDocumentKey);
    }
  }, [contacts, chatsDocumentKey, onLoaded]);

  // The inviter's side of the handshake: once the invitee has ACCEPTED the
  // request, pick up our ECDH-wrapped copy of the chat key, record the
  // contact locally, and confirm receipt so the server can delete the
  // now-redundant request.
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
          setContacts((prev) => (prev ?? []).concat(newContact));
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
      {chatsLoadFailed && (
        <div className="padding">
          {i18n.t("Could not load your chats. Retrying...")}
        </div>
      )}
      {(contacts && contacts.length > 0) || openInvitations.length > 0 ? (
        <ul className="list border">
          {openInvitations.map((contactRequest, index) => (
            <li key={index}>
              <button className="circle">
                {contactRequest.inviter.charAt(0).toLocaleUpperCase()}
              </button>
              <div className="max">
                <h6 className="small">{contactRequest.inviter}</h6>
                <div>{contactRequest.inviter}</div>
              </div>
              <div>
                <AcceptInvitationButton
                  user={user}
                  contact={contactRequest.inviter}
                  contactPublicKey={contactRequest.publicKey}
                  contactPublicProfileId={contactRequest.publicProfileId}
                  onAccepted={(newContact) => {
                    setContactRequests((contactRequests) =>
                      contactRequests?.filter(
                        (request) => request.inviter !== contactRequest.inviter,
                      ),
                    );
                    setContacts((contacts) =>
                      (contacts ?? []).concat(newContact),
                    );
                  }}
                />
                <DeclineInvitationButton
                  user={user}
                  contact={contactRequest.inviter}
                  onDeclined={() =>
                    setContactRequests((contactRequests) =>
                      contactRequests?.filter(
                        (request) => request.inviter !== contactRequest.inviter,
                      ),
                    )
                  }
                />
              </div>
            </li>
          ))}
          {contacts &&
            contacts.map((contact, index) => (
              <li key={index + openInvitations.length}>
                <NavLink
                  to={`/chats/${contact.userId}`}
                  className={({ isActive }) =>
                    isActive ? "active surface-variant" : ""
                  }
                >
                  <button className="circle transparent">
                    {contact.userId.charAt(0).toLocaleUpperCase()}
                  </button>
                  <div className="max">
                    <h6 className="small">{contact.userId}</h6>
                    <div>{contact.userId}</div>
                  </div>
                  <label>{new Date().toLocaleDateString(i18n.language)}</label>
                </NavLink>
              </li>
            ))}
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
    </section>
  );
}
