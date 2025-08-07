import { NavLink } from "react-router";
import ChatIcon from "../icons/ChatIcon";
import ImageIcon from "../icons/ImageIcon";
import { useTranslation } from "react-i18next";

export default function Navigation({ style }: { style: "rail" | "drawer" }) {
  const { t } = useTranslation();
  return (
    <nav className={style}>
      <ul>
        <li>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "icon")}
          >
            <ImageIcon />
            {t("Images")}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/chats"
            className={({ isActive }) => (isActive ? "active" : "icon")}
          >
            <ChatIcon />
            {t("Chats")}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
