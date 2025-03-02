import { Button } from "@mui/material";
import MenuIcon from "../icons/MenuIcon";
import { useEffect, useState } from "react";
import Navigation from "./Navigation";
import { useLocation } from "react-router";

export default function MenuButton() {
  const location = useLocation();
  const [navigationDrawerVisible, setNavigationDrawerVisible] = useState(false);

  useEffect(() => {
    // hide navigation drawer on page change
    setNavigationDrawerVisible(false);
  }, [location]);

  return (
    <>
      <Button
        aria-label="main-menu"
        className={"menu"}
        onClick={() => setNavigationDrawerVisible((visible) => !visible)}
      >
        <MenuIcon />
      </Button>
      {navigationDrawerVisible && <Navigation style="drawer" />}
    </>
  );
}
