import { useState } from "react";
import { useTranslation } from "react-i18next";

// Asks for a chat display name the first time a contact request is sent or
// accepted without one already set (see docs/plans/chat-public-profile.md
// §3.6) - used by Chats.tsx (before sending) and AcceptInvitationButton.tsx
// (before accepting). Not used by the invite-registration flow, which asks
// via its own field directly in RegistrationDialog.tsx (§3.6/§10).
export default function DisplayNamePrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <dialog className="surface-bright active" open>
      <h5 className="primary-text">{t("How should others see you?")}</h5>
      <form onSubmit={handleSubmit}>
        <div className={`field label border ${nameError ? "invalid" : ""}`}>
          <input
            id="display-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
          />
          <label htmlFor="display-name">{t("Name")}</label>
          <span className="error">{t("Please enter a name.")}</span>
        </div>
        <nav className="right-align no-space">
          <button className="transparent link" type="button" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button className="transparent link" type="submit">
            {t("Confirm")}
          </button>
        </nav>
      </form>
    </dialog>
  );
}
