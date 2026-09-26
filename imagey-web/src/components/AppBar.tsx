import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";
import BackButton from "./BackButton";
import { getAppName } from "../utils/appName";

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
              <img src={titleAvatar} alt={title} className="circle small" />
            ) : (
              <div className="circle surface center-align middle-align small">
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
