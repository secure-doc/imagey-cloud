import { NavLink } from "react-router";
import ChatIcon from "../icons/ChatIcon";
import ImageIcon from "../icons/ImageIcon";

export default function Navigation({ style }: { style: "rail" | "drawer" }) {
  return (
    <nav className={style}>
      <ul>
        <li>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <ImageIcon />
            Bilder
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/chats"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <ChatIcon />
            Chats
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
