import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";

export default function AppBar() {
  const { actionIcons } = useContext(ActionBarContext);

  return (
    <header className="primary-container">
      <nav>
        <MenuButton />
        <h6 className="center-align max">Imagey</h6>
        {actionIcons}
      </nav>
    </header>
  );
}
