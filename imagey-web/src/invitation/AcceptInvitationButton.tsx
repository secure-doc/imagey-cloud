import { contactService } from "../contact/ContactService";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function AcceptInvitationButton({
  className = "",
  userId,
  contact,
  onAccepted,
}: {
  className?: string;
  userId: string;
  contact: string;
  onAccepted: () => void;
}) {
  const mainKeyPair = useAuthentication().keyPairs.mainKeyPair;
  return (
    <button
      className={`${className} circle transparent`}
      onClick={() => {
        contactService
          .acceptContactRequest(userId, contact, mainKeyPair)
          .then(() => onAccepted());
      }}
    >
      <i>check</i>
    </button>
  );
}
