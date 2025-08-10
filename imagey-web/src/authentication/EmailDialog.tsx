import { useState } from "react";
import { useTranslation } from "react-i18next";

interface EmailDialogProperties {
  onEmailSelected: (email: string) => void;
}

export default function EmailDialog({
  onEmailSelected,
}: EmailDialogProperties) {
  const { t } = useTranslation();
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emailError) {
      return;
    }
    const data = new FormData(event.currentTarget);
    const email = data.get("email")?.toString();
    if (email) {
      onEmailSelected(email);
    }
  };

  const validateInputs = () => {
    const email = document.getElementById("email") as HTMLInputElement;
    if (!email.value || !/\S+@\S+\.\S+/.test(email.value)) {
      setEmailError(true);
      setEmailErrorMessage(t("Please enter a valid email address."));
      return false;
    } else {
      setEmailError(false);
      setEmailErrorMessage("");
      return true;
    }
  };

  return (
    <dialog className="surface-bright" open>
      <h5 className="primary-text">Default</h5>
      <form onSubmit={handleSubmit}>
        <div className={`field label border ${emailError ? "invalid" : ""}`}>
          <input
            id="email"
            name="email"
            type="text"
            placeholder="email@imagey.cloud"
            onChange={validateInputs}
          />
          <label htmlFor="email">{t("Email")}</label>
          <span className="error">{emailErrorMessage}</span>
        </div>
        <nav className="right-align no-space">
          <button className="transparent link">{t("Cancel")}</button>
          <button className="transparent link" type="submit">
            {t("Confirm")}
          </button>
        </nav>
      </form>
    </dialog>
  );
}
