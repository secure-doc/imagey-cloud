import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  federationAvailable,
  normalizeServer,
  verifyServer,
} from "../federation/server";
import { getAppName } from "../utils/appName";

// The address an invitation token was sent to, for display only: the payload is read without
// checking the signature (the server does that when the token is used).
function invitedAddress(token: string): string | undefined {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    // atob yields one character per byte: decode them as UTF-8, not as Latin-1.
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const subject = JSON.parse(new TextDecoder().decode(bytes)).sub;
    return typeof subject === "string" ? subject : undefined;
  } catch {
    return undefined;
  }
}

// Where an emailed invitation link lands (InvitationFilter): the invitee chooses to register
// here or to accept with an account on another server (ADR 0013 A11). Reachable without a
// session. The token travels in the fragment, so it reaches neither a log nor a Referer.
export default function Join() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token");
  const invitedBy = params.get("invited-by");
  const [federated, setFederated] = useState(false);
  const [server, setServer] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    federationAvailable().then(setFederated);
  }, []);

  if (!token || !invitedBy) {
    return (
      <dialog className="surface-bright" open>
        <h5 className="primary-text">{t("Invalid invitation link")}</h5>
      </dialog>
    );
  }
  const address = invitedAddress(token);

  const proceed = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    let origin: string;
    try {
      origin = normalizeServer(server);
    } catch {
      setError(t("Invalid server address"));
      return;
    }
    if (origin === window.location.origin) {
      setError(t("This is this server - please choose the first option"));
      return;
    }
    setBusy(true);
    const result = await verifyServer(origin);
    setBusy(false);
    if (result !== "ok") {
      setError(t("No compatible server was found at this address"));
      return;
    }
    const fragment = new URLSearchParams({
      token,
      "invited-by": invitedBy,
      from: window.location.origin,
    });
    window.location.assign(`${origin}/federation/accept#${fragment}`);
  };

  return (
    <dialog className="surface-bright" open>
      <h5 className="primary-text">
        {t("You have been invited to {{app}}", { app: getAppName() })}
      </h5>
      {address && <p>{address}</p>}
      <form
        method="post"
        action={`/invitations/${encodeURIComponent(token)}/registration`}
      >
        <input type="hidden" name="invited-by" value={invitedBy} />
        <nav>
          <button type="submit">{t("Create an account here")}</button>
        </nav>
      </form>
      {federated && (
        <form onSubmit={proceed}>
          <h6>{t("I already have an account on another server")}</h6>
          <div className={"field label border" + (error ? " invalid" : "")}>
            <input
              id="server"
              value={server}
              placeholder="secure-doc.store"
              onChange={(e) => setServer(e.target.value)}
            />
            <label htmlFor="server">{t("Server")}</label>
            {error && <span className="error">{error}</span>}
          </div>
          <nav>
            <button type="submit" disabled={busy || !server.trim()}>
              {t("Continue")}
            </button>
          </nav>
        </form>
      )}
    </dialog>
  );
}
