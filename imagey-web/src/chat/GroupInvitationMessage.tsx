import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

interface GroupInvitationMessageProps {
  name: string;
  // Whether the "chats" document already has a GroupEntry for this group -
  // i.e. we (or another tab/device) already joined - renders "Open" instead
  // of "Join". See Chat.tsx's `alreadyJoined` computation.
  alreadyJoined: boolean;
  groupId: string;
  onJoin: () => Promise<void>;
}

// Renders a "group-invitation" message (ADR 0019 decision 3) in a 1:1 chat -
// the pattern is AcceptInvitationButton's busy/failed state, without the
// display-name prompt (joining does not need one).
export function GroupInvitationMessage({
  name,
  alreadyJoined,
  groupId,
  onJoin,
}: GroupInvitationMessageProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleJoin = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onJoin();
    } catch (e) {
      console.error("Failed to join group", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-invitation">
      <div>{t("Group invitation: {{name}}", { name })}</div>
      {alreadyJoined ? (
        <NavLink to={`/chats/groups/${groupId}`} className="button">
          {t("Open")}
        </NavLink>
      ) : (
        <button disabled={busy} onClick={handleJoin}>
          {busy ? (
            <progress className="circle small"></progress>
          ) : failed ? (
            t("Retry")
          ) : (
            t("Join")
          )}
        </button>
      )}
    </div>
  );
}
