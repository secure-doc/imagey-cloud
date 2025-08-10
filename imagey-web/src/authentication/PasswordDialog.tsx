import { useState } from "react";
import { useTranslation } from "react-i18next";

/*
const Card = styled(MuiCard)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignSelf: "center",
  width: "100%",
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: "auto",
  [theme.breakpoints.up("sm")]: {
    maxWidth: "450px",
  },
  boxShadow:
    "hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px",
  ...theme.applyStyles("dark", {
    boxShadow:
      "hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px",
  }),
}));

const SignInContainer = styled(Stack)(({ theme }) => ({
  minHeight: "100%",
  padding: theme.spacing(2),
  [theme.breakpoints.up("sm")]: {
    padding: theme.spacing(4),
  },
  "&::before": {
    content: '""',
    display: "block",
    position: "absolute",
    zIndex: -1,
    inset: 0,
    backgroundImage:
      "radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))",
    backgroundRepeat: "no-repeat",
    ...theme.applyStyles("dark", {
      backgroundImage:
        "radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))",
    }),
  },
}));
*/
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
        .then((result) => onPasswordValid(result))
        .catch(() => setPasswordError(true));
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
