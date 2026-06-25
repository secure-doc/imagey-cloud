import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import { NavLink } from "react-router";
import { useActionIcons } from "../contexts/ActionBarContext";
import ContactRequestDialog from "../contact/ContactRequestDialog";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { Contact } from "../contact/Contact";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import NoContactsPanel from "../activity/NoContactsPanel";

export default function Chats() {
  const { i18n } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [contactRequests, setContactRequests] = useState<Contact[]>();
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
      .getContacts(user)
      .then((contacts) => setContacts(contacts))
      .catch((e) => console.error("Failed to fetch contacts", e));
    contactRepository
      .getContactRequests(user)
      .then((contactRequests) => setContactRequests(contactRequests))
      .catch((e) => console.error("Failed to fetch contact requests", e));
  }, [user]);

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
    <main>
      {(contacts && contacts.length > 0) ||
      (contactRequests && contactRequests.length > 0) ? (
        <ul className="list border">
          {contactRequests &&
            contactRequests.map((contactRequest, index) => (
              <li key={index}>
                <button className="circle">
                  {contactRequest.email.charAt(0).toLocaleUpperCase()}
                </button>
                <div className="max">
                  <h6 className="small">{contactRequest.email}</h6>
                  <div>{contactRequest.email}</div>
                </div>
                <div>
                  <AcceptInvitationButton
                    user={user}
                    contact={contactRequest.email}
                    onAccepted={() => {
                      setContactRequests((contactRequests) =>
                        contactRequests?.filter(
                          (request) => request.email !== contactRequest.email,
                        ),
                      );
                      setContacts((contacts) =>
                        contacts?.concat(contactRequest),
                      );
                    }}
                  />
                  <DeclineInvitationButton
                    user={user}
                    contact={contactRequest.email}
                    onDeclined={() =>
                      setContactRequests((contactRequests) =>
                        contactRequests?.filter(
                          (request) => request.email !== contactRequest.email,
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
                <NavLink to={`/chats/${contact.email}`}>
                  <button className="circle transparent">
                    {contact.email.charAt(0).toLocaleUpperCase()}
                  </button>
                  <div className="max">
                    <h6 className="small">{contact.email}</h6>
                    <div>{contact.email}</div>
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
    </main>
  );
}
