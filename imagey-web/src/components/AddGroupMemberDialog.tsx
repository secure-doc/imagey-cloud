import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactService } from "../contact/ContactService";
import { groupService } from "../contact/GroupService";
import { ContactEntry } from "../document/DocumentMetadata";
import { contactDisplayName } from "../contact/contactDisplayName";

interface GroupState {
  documentId: string;
  key: JsonWebKey;
  revision: string | null;
  name: string;
  members: string[];
  publicProfiles: Record<string, string>;
}

interface AddGroupMemberDialogProps {
  contacts: ContactEntry[];
  chatsId: string;
  chatsDocumentKey: JsonWebKey;
  group: GroupState;
  onClose: () => void;
  onAdded: (group: GroupState) => void;
}

// Owner-only "add member" action (ADR 0019 decision 2): only contacts not
// already in the group can be picked, mirroring CreateGroupDialog's
// selection UI. Adds are sequential, each building on the previous member's
// already-updated group metadata/revision - like CreateGroupDialog's own
// selection loop.
export default function AddGroupMemberDialog({
  contacts,
  chatsId,
  chatsDocumentKey,
  group,
  onClose,
  onAdded,
}: AddGroupMemberDialogProps) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const addableContacts = contacts.filter(
    (c) => !group.members.includes(c.userId),
  );
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set(),
  );
  const [isAdding, setIsAdding] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const handleAdd = async () => {
    setIsAdding(true);
    setFailed(false);
    let current = group;
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
            chatsDocumentKey,
          );
        const updated = await groupService.addMember(user, current, {
          userId: contactUserId,
          publicProfileId: publicProfiles[contactUserId],
          chatOwnerId: contact.owner,
          chatId: contact.chatId,
          pairChatKey,
        });
        current = {
          ...current,
          members: updated.members,
          publicProfiles: updated.publicProfiles,
          revision: updated.revision ?? current.revision,
        };
      }
      onAdded(current);
      onClose();
    } catch (e) {
      console.error("Failed to add group member", e);
      onAdded(current);
      setFailed(true);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <div className="overlay active" onClick={onClose}></div>
      <dialog className="surface-bright active" open>
        <h5>{t("Add Member")}</h5>
        {addableContacts.length === 0 ? (
          <div className="padding">
            {t("All your contacts are already members")}
          </div>
        ) : (
          <div className="padding scroll" style={{ maxHeight: "40vh" }}>
            {addableContacts.map((contact) => (
              <label
                key={contact.userId}
                className="row padding"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selectedContacts.has(contact.userId)}
                  disabled={isAdding}
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
          <div className="error padding">{t("Failed to add member")}</div>
        )}
        <nav className="right-align">
          <button className="transparent" onClick={onClose} disabled={isAdding}>
            {t("Cancel")}
          </button>
          <button
            onClick={handleAdd}
            disabled={selectedContacts.size === 0 || isAdding}
          >
            {isAdding ? (
              <progress className="circle small"></progress>
            ) : (
              t("Add")
            )}
          </button>
        </nav>
      </dialog>
    </>
  );
}
