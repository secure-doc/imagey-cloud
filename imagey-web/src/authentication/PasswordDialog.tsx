import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PasswordDialogProperties<R> {
  message: string;
  validatePassword: (password: string) => Promise<R>;
  onPasswordValid: (result: R) => void;
}

export default function PasswordDialog<R>({
  message,
  validatePassword,
  onPasswordValid,
}: PasswordDialogProperties<R>) {
  const { t } = useTranslation();
  const [passwordError, setPasswordError] = useState(false);
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get("password")?.toString();
    if (password) {
      validatePassword(password)
        .then((result) => {
          setPasswordError(false);
          onPasswordValid(result);
        })
        .catch(() =>
          // TODO handle forbidden
          setPasswordError(true),
        );
    }
  };

  return (
    <dialog className="surface-bright" open>
      <h5 className="primary-text">{message}</h5>
      <form onSubmit={handleSubmit}>
        <div className={`field label border ${passwordError ? "invalid" : ""}`}>
          <input id="password" name="password" type="password" />
          <label htmlFor="password">{t("Password")}</label>
          <span className="error">
            {passwordError ? t("Wrong password") : ""}
          </span>
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
