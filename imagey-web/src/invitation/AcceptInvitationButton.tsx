import { contactRepository } from "../contact/ContactRepository";
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
  onAccepted: () => void;
}) {
  const mainKeyPair = useAuthentication().keyPairs.mainKeyPair;
  return (
    <button
      className={`${className} circle transparent`}
      onClick={() => {
        contactRepository
          .acceptContactRequest(user, contact, mainKeyPair)
          .then(() => onAccepted());
      }}
    >
      <i>check</i>
    </button>
  );
}
