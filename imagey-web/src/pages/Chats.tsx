import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import { NavLink } from "react-router";
import { useActionIcons } from "../contexts/ActionBarContext";
import ContactRequestDialog from "../contact/ContactRequestDialog";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { ContactRequest } from "../contact/ContactRequest";
import { Contact } from "../contact/Contact";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import NoContactsPanel from "../activity/NoContactsPanel";

export default function Chats() {
  return (
    <main>
      <ChatsList />
    </main>
  );
}

export function ChatsList({
  className,
  activeContactEmail,
}: {
  className?: string;
  activeContactEmail?: string;
}) {
  const { i18n } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const keyPair = authentication.keyPairs.mainKeyPair;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>();
  const [contacts, setContacts] = useState<Contact[]>();

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

  useEffect(() => {
    contactRepository
      .getContacts(user, keyPair.publicKey, keyPair.privateKey)
      .then((contacts) => setContacts(contacts))
      .catch((e) => console.error("Failed to fetch contacts", e));
    contactRepository
      .getContactRequests(user)
      .then((contactRequests) => setContactRequests(contactRequests))
      .catch((e) => console.error("Failed to fetch contact requests", e));
  }, [user, keyPair]);

  const handleContactRequest = async (email: string) => {
    if (user) {
      try {
        await contactRepository.sendContactRequest(user, email);
        setIsDialogOpen(false);
      } catch (error) {
        console.error("Failed to send contact request", error);
      }
    }
  };

  return (
    <section
      className={
        className ? className + " col scroll s12 m4 l4" : "col scroll s12 m4 l4"
      }
      style={
        activeContactEmail
          ? { borderRight: "1px solid var(--surface-variant)" }
          : undefined
      }
    >
      {(contacts && contacts.length > 0) ||
      (contactRequests && contactRequests.length > 0) ? (
        <ul className="list border">
          {contactRequests &&
            contactRequests.map((contactRequest, index) => (
              <li key={index}>
                <button className="circle">
                  {contactRequest.userId.charAt(0).toLocaleUpperCase()}
                </button>
                <div className="max">
                  <h6 className="small">{contactRequest.userId}</h6>
                  <div>{contactRequest.userId}</div>
                </div>
                <div>
                  <AcceptInvitationButton
                    user={user}
                    contact={contactRequest.userId}
                    onAccepted={(documentId, key) => {
                      setContactRequests((contactRequests) =>
                        contactRequests?.filter(
                          (request) => request.userId !== contactRequest.userId,
                        ),
                      );
                      setContacts((contacts) =>
                        (contacts || []).concat({
                          userId: contactRequest.userId,
                          documentId: documentId,
                          key: key,
                        }),
                      );
                    }}
                  />
                  <DeclineInvitationButton
                    user={user}
                    contact={contactRequest.userId}
                    onDeclined={() =>
                      setContactRequests((contactRequests) =>
                        contactRequests?.filter(
                          (request) => request.userId !== contactRequest.userId,
                        ),
                      )
                    }
                  />
                </div>
              </li>
            ))}
          {contacts &&
            contacts.map((contact, index) => (
              <li key={index + (contactRequests ? contactRequests.length : 0)}>
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
          onConfirm={handleContactRequest}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
    </section>
  );
}
