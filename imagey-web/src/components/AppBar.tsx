import { useContext } from "react";
import MenuButton from "./MenuButton";
import { ActionBarContext } from "../contexts/ActionBarContext";

export default function AppBar() {
  const { actionIcons } = useContext(ActionBarContext);

  return (
    <header>
      <MenuButton />
      <h1>Imagey</h1>
      <div className="action-bar">{actionIcons}</div>
    </header>
  );
}
