import { contactService } from "../contact/ContactService";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function AcceptInvitationButton({
  className = "",
  user,
  contact,
  onAccepted,
}: {
  className?: string;
  user: string;
  contact: string;
  onAccepted: (documentId: string, key: JsonWebKey) => void;
}) {
  const mainKeyPair = useAuthentication().keyPairs.mainKeyPair;
  return (
    <button
      className={`${className} circle transparent`}
      onClick={() => {
        contactService
          .acceptContactRequest(user, contact, mainKeyPair)
          .then(({ documentId, key }) => onAccepted(documentId, key));
      }}
    >
      <i>check</i>
    </button>
  );
}
