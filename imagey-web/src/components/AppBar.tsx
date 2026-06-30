import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";
import BackButton from "./BackButton";
import { getAppName } from "../utils/appName";

export default function AppBar() {
  const { actionIcons, backButtonVisible, title } =
    useContext(ActionBarContext);

  return (
    <header className="primary-container fixed" style={{ gridArea: "top" }}>
      <nav>
        {backButtonVisible ? <BackButton /> : <MenuButton />}
        <h6 className="center-align max">{title ?? getAppName()}</h6>
        {actionIcons}
      </nav>
    </header>
  );
}
