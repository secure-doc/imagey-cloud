import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ACCEPT_PATH,
  loadPendingFederatedInvitation,
} from "./pendingInvitation";

// After a login the app opens wherever the login led (or stays where it was); an invitation that
// was waiting for it takes the user back to its page, once (ADR 0013 A11).
export default function PendingFederatedInvitationRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    if (pathname !== ACCEPT_PATH && loadPendingFederatedInvitation()) {
      navigate(ACCEPT_PATH, { replace: true });
    }
  }, [navigate, pathname]);

  return null;
}
