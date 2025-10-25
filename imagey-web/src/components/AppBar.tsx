import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";
import BackButton from "./BackButton";

export default function AppBar() {
  const { actionIcons, backButtonVisible } = useContext(ActionBarContext);

  return (
    <header className="primary-container" style={{ gridArea: "top" }}>
      <nav>
        {backButtonVisible ? <BackButton /> : <MenuButton />}
        <h6 className="center-align max">Imagey</h6>
        {actionIcons}
      </nav>
    </header>
  );
}
