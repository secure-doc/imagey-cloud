import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceRepository } from "../device/DeviceRepository";

interface PasswordDialogProperties<R> {
  message: string;
  email?: string;
  requireConfirmation?: boolean;
  onWrongUser?: () => void;
  showKeepLoggedIn?: boolean;
  // Extra form content rendered between the password field(s) and the confirm
  // button - e.g. the display-name field RegistrationDialog adds for an
  // invite-based registration (see docs/plans/chat-public-profile.md §3.6).
  // Any inputs in here are the caller's own controlled state, independent of
  // validatePassword/onPasswordValid.
  children?: React.ReactNode;
  validatePassword: (password: string, keepLoggedIn: boolean) => Promise<R>;
  onPasswordValid: (result: R, keepLoggedIn: boolean) => void;
}

export default function PasswordDialog<R>({
  message,
  email,
  requireConfirmation,
  onWrongUser,
  showKeepLoggedIn,
  children,
  validatePassword,
  onPasswordValid,
}: PasswordDialogProperties<R>) {
  const { t } = useTranslation();
  // Remember the last choice across sign-ins and default it on, so a returning
  // user is not silently downgraded to a session that expires on the next reload.
  const [keepLoggedIn, setKeepLoggedIn] = useState(
    () => deviceRepository.loadKeepLoggedIn() ?? true,
  );
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
      validatePassword(password, keepLoggedIn)
        .then((result) => {
          setPasswordError(false);
          onPasswordValid(result, keepLoggedIn);
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
      {email && (
        <div className="padding">
          <div>{t("Signed in as")}</div>
          <div>{email}</div>
        </div>
      )}
      {onWrongUser && (
        <div className="padding">
          <div>
            {t("Not you?")}&nbsp;
            <a className="primary-text" onClick={onWrongUser}>
              {t("Sign in with a different email")}
            </a>
          </div>
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
        {children}
        {showKeepLoggedIn && (
          <div className="field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => {
                  setKeepLoggedIn(e.target.checked);
                  deviceRepository.storeKeepLoggedIn(e.target.checked);
                }}
              />
              <span>{t("Keep me logged in")}</span>
            </label>
          </div>
        )}
        <nav className="right-align no-space">
          <button className="transparent link" type="submit">
            {t("Confirm")}
          </button>
        </nav>
      </form>
    </dialog>
  );
}
