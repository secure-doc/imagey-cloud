import { useCallback, useContext, useEffect, useMemo } from "react";
import { ActionBarContext } from "../contexts/ActionBarContext";
import { useLocation, useNavigate } from "react-router";

export default function BackButton() {
  const { setBackButtonVisible } = useContext(ActionBarContext);
  const navigate = useNavigate();
  const location = useLocation();
  const parentPath = useMemo(() => {
    const segments = location.pathname.split("/");
    segments.pop();
    return segments.join("/") || "/";
  }, [location]);
  useEffect(() => {
    if (!location.pathname.substring(1).includes("/")) {
      setBackButtonVisible(false);
    }
  }, [location, setBackButtonVisible]);
  const back = useCallback(() => navigate(parentPath), [parentPath, navigate]);

  return (
    <button
      aria-label="back-button"
      className="circle transparent s"
      onClick={back}
    >
      <i>arrow_back</i>
    </button>
  );
}
