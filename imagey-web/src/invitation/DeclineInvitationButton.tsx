import { contactRepository } from "../contact/ContactRepository";

export default function DeclineInvitationButton({
  className = "",
  user,
  contact,
  onDeclined,
}: {
  className?: string;
  user: string;
  contact: string;
  onDeclined: () => void;
}) {
  return (
    <button
      className={className ?? "" + " circle transparent"}
      onClick={() => {
        contactRepository
          .declineContactRequest(user, contact)
          .then(() => onDeclined());
      }}
    >
      <i>close</i>
    </button>
  );
}
