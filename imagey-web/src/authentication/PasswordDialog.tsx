import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PasswordDialogProperties<R> {
  message: string;
  email?: string;
  requireConfirmation?: boolean;
  onWrongUser?: () => void;
  validatePassword: (password: string) => Promise<R>;
  onPasswordValid: (result: R) => void;
}

export default function PasswordDialog<R>({
  message,
  email,
  requireConfirmation,
  onWrongUser,
  validatePassword,
  onPasswordValid,
}: PasswordDialogProperties<R>) {
  const { t } = useTranslation();
  const [passwordError, setPasswordError] = useState(false);
  const [passwordsDoNotMatch, setPasswordsDoNotMatch] = useState(false);
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get("password")?.toString();
    const confirmPassword = data.get("confirmPassword")?.toString();

    if (requireConfirmation && password !== confirmPassword) {
      setPasswordsDoNotMatch(true);
      return;
    }
    setPasswordsDoNotMatch(false);

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
      {email && onWrongUser && (
        <div className="center-align padding">
          <div>{email}</div>
          <button
            className="transparent link"
            type="button"
            onClick={onWrongUser}
          >
            {t("Not {{email}}?", { email })}
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className={`field label border ${passwordError ? "invalid" : ""}`}>
          <input id="password" name="password" type="password" />
          <label htmlFor="password">{t("Password")}</label>
          <span className="error">
            {passwordError ? t("Wrong password") : ""}
          </span>
        </div>
        {requireConfirmation && (
          <div
            className={`field label border ${passwordsDoNotMatch ? "invalid" : ""}`}
          >
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
            />
            <label htmlFor="confirmPassword">{t("Confirm Password")}</label>
            <span className="error">
              {passwordsDoNotMatch ? t("Passwords do not match") : ""}
            </span>
          </div>
        )}
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
