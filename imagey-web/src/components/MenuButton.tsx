import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import Navigation from "./Navigation";

export default function MenuButton() {
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => setDialogOpen(false), [location]);

  return (
    <>
      <button
        aria-label="main-menu"
        className="circle transparent s"
        onClick={() => setDialogOpen(true)}
      >
        <i>menu</i>
      </button>
      {dialogOpen && (
        <div
          className="overlay active"
          onClick={() => setDialogOpen(false)}
        ></div>
      )}
      {dialogOpen && (
        <dialog className="left" open>
          <Navigation className="left max" />
        </dialog>
      )}
    </>
  );
}
