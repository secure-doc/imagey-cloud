import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";

export default function Navigation({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <nav className={className ?? ""}>
      <NavLink aria-label={t("Home")} to="/">
        <i>home</i>
        <div>{t("Home")}</div>
      </NavLink>
      <NavLink aria-label={t("Images")} to="/images">
        <i>photo_library</i>
        <div>{t("Images")}</div>
      </NavLink>
      <NavLink aria-label={t("Chats")} to="/chats">
        <i>chat</i>
        <div>{t("Chats")}</div>
      </NavLink>
    </nav>
  );
}
