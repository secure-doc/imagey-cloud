import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";
import BackButton from "./BackButton";
import { getAppName } from "../utils/appName";

// BeerCSS only sizes img/svg/video via `.small`, so the initial-letter div
// would size to its text, and the flex row would shrink either one next to a
// long title - both render oval instead of round.
const avatarStyle = {
  inlineSize: "2.5rem",
  blockSize: "2.5rem",
  flex: "none",
} as const;

export default function AppBar() {
  const { actionIcons, backButtonVisible, title, titleAvatar } =
    useContext(ActionBarContext);

  return (
    <header className="primary-container fixed" style={{ gridArea: "top" }}>
      <nav>
        {backButtonVisible ? <BackButton /> : <MenuButton />}
        {titleAvatar === undefined ? (
          <h6 className="center-align max">{title ?? getAppName()}</h6>
        ) : (
          <div className="row max center-align middle-align">
            {titleAvatar ? (
              <img
                src={titleAvatar}
                alt={title}
                className="circle small"
                style={avatarStyle}
              />
            ) : (
              <div
                className="circle surface center-align middle-align"
                style={avatarStyle}
              >
                {title?.charAt(0).toLocaleUpperCase()}
              </div>
            )}
            <h6 className="no-margin">{title}</h6>
          </div>
        )}
        {actionIcons}
      </nav>
    </header>
  );
}
