import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import {
  contactService,
  ChatsDocumentState,
  ChatList,
} from "../contact/ContactService";
import { groupService } from "../contact/GroupService";
import { publicProfileService } from "../profile/publicProfileService";
import { ContactEntry } from "../document/DocumentMetadata";
import { contactDisplayName } from "../contact/contactDisplayName";

interface CreateGroupDialogProps {
  contacts: ContactEntry[];
  chatsDocument: ChatsDocumentState;
  chatsId: string;
  onClose: () => void;
  onCreated: (list: ChatList, revision: string | null) => void;
}

// Creates a group and, for every contact checked in the dialog, immediately
// adds them as a member (ADR 0019 decisions 1/2) - one createGroup call
// followed by one addMember call per selection, sequential so each builds on
// the previous member's already-updated group metadata/revision.
export default function CreateGroupDialog({
  contacts,
  chatsDocument,
  chatsId,
  onClose,
  onCreated,
}: CreateGroupDialogProps) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const settings = authentication.settings;
  const [groupName, setGroupName] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set(),
  );
  const [isCreating, setIsCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [memberError, setMemberError] = useState(false);

  const toggleContact = (contactUserId: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactUserId)) {
        next.delete(contactUserId);
      } else {
        next.add(contactUserId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name || !user) return;
    setIsCreating(true);
    setFailed(false);
    setMemberError(false);
    let created;
    let publicProfile;
    try {
      ({ publicProfile } =
        await publicProfileService.loadProfileAndEnsurePublicProfile(
          user,
          settings,
        ));
      created = await groupService.createGroup(
        user,
        name,
        chatsDocument,
        publicProfile,
      );
    } catch (e) {
      console.error("Failed to create group", e);
      setFailed(true);
      setIsCreating(false);
      return;
    }
    // The group is now persisted on the server, so the caller must learn
    // about it immediately - a later addMember failure must not hide it
    // from the local chat list (it would otherwise be re-created under a
    // new groupId on the next "Create" click, orphaning this one).
    onCreated(created.list, created.revision);
    let group = {
      documentId: created.groupId,
      key: created.groupKey,
      // Genuinely unknown until the group Document's first real load - see
      // NewDocumentMetadata / publicProfileService.createPublicProfile for
      // the same "" convention; falsy so the next write sends no
      // precondition rather than a fabricated one.
      revision: "" as string | null,
      name,
      members: [user],
      publicProfiles: { [user]: publicProfile.documentId },
    };
    try {
      for (const contactUserId of selectedContacts) {
        const contact = contacts.find((c) => c.userId === contactUserId);
        if (!contact) {
          continue;
        }
        const { key: pairChatKey, publicProfiles } =
          await contactService.loadChatKey(
            user,
            contact,
            chatsId,
            chatsDocument.key,
          );
        const updated = await groupService.addMember(user, group, {
          userId: contactUserId,
          publicProfileId: publicProfiles[contactUserId],
          chatOwnerId: contact.owner,
          chatId: contact.chatId,
          pairChatKey,
        });
        group = {
          ...group,
          members: updated.members,
          publicProfiles: updated.publicProfiles,
          revision: updated.revision ?? group.revision,
        };
      }
      onClose();
    } catch (e) {
      console.error("Failed to add member to group", e);
      setMemberError(true);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="overlay active" onClick={onClose}></div>
      <dialog className="surface-bright active" open>
        <h5>{t("Create Group")}</h5>
        <div className="field border">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            disabled={isCreating}
            placeholder={t("Group Name")}
            autoFocus
          />
        </div>
        {contacts.length > 0 && (
          <div className="padding scroll" style={{ maxHeight: "40vh" }}>
            {contacts.map((contact) => (
              <label
                key={contact.userId}
                className="row padding"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selectedContacts.has(contact.userId)}
                  disabled={isCreating}
                  onChange={() => toggleContact(contact.userId)}
                />
                <span>
                  {contactDisplayName(
                    contact.userId,
                    contact,
                    t("Unknown contact"),
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        {failed && (
          <div className="error padding">{t("Failed to create group")}</div>
        )}
        {memberError && (
          <div className="error padding">
            {t("Group created, but not all members could be added")}
          </div>
        )}
        <nav className="right-align">
          {memberError ? (
            <button onClick={onClose}>{t("Close")}</button>
          ) : (
            <>
              <button
                className="transparent"
                onClick={onClose}
                disabled={isCreating}
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleCreate}
                disabled={!groupName.trim() || isCreating}
              >
                {isCreating ? (
                  <progress className="circle small"></progress>
                ) : (
                  t("Create")
                )}
              </button>
            </>
          )}
        </nav>
      </dialog>
    </>
  );
}
