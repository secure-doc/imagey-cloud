import { NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

export default function Navigation({ className }: { className?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const isSettings = location.pathname.startsWith("/settings");

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
      <NavLink
        className={({ isActive }) =>
          `m l ${isActive || isSettings ? "active" : ""}`.trim()
        }
        aria-label={t("Settings")}
        to="/settings/profile"
      >
        <i>settings</i>
        <div>{t("Settings")}</div>
      </NavLink>
      <NavLink
        className={({ isActive }) =>
          `s ${isActive || isSettings ? "active" : ""}`.trim()
        }
        aria-label={t("Settings")}
        to="/settings"
      >
        <i>settings</i>
        <div>{t("Settings")}</div>
      </NavLink>
    </nav>
  );
}
