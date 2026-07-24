import { contactRepository } from "../contact/ContactRepository";

export default function DeclineInvitationButton({
  className = "",
  userId,
  contact,
  onDeclined,
}: {
  className?: string;
  userId: string;
  contact: string;
  onDeclined: () => void;
}) {
  return (
    <button
      className={className ?? "" + " circle transparent"}
      onClick={() => {
        contactRepository
          .declineContactRequest(userId, contact)
          .then(() => onDeclined());
      }}
    >
      <i>close</i>
    </button>
  );
}
