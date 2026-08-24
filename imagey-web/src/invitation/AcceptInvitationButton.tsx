import { useState } from "react";
import { contactService } from "../contact/ContactService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { Contact } from "../contact/Contact";

export default function AcceptInvitationButton({
  className = "",
  user,
  contact,
  contactPublicKey,
  onAccepted,
}: {
  className?: string;
  user: string;
  contact: string;
  contactPublicKey: JsonWebKey;
  onAccepted: (contact: Contact) => void;
}) {
  const authentication = useAuthentication();
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const settings = authentication.settings;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`${className} circle transparent`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        setFailed(false);
        contactService
          .acceptContactRequest(
            user,
            contact,
            contactPublicKey,
            settings,
            mainKeyPair,
          )
          .then((newContact) => onAccepted(newContact))
          .catch((e) => {
            console.error("Failed to accept contact request", e);
            setFailed(true);
          })
          .finally(() => setBusy(false));
      }}
    >
      <i>{failed ? "error" : "check"}</i>
    </button>
  );
}
