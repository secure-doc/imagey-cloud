import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { repositoriesFor } from "../api/repositoriesFor";
import { contactService } from "../contact/ContactService";
import { ContactInfo, ContactRequest } from "../contact/ContactRequest";
import DisplayNamePrompt from "../contact/DisplayNamePrompt";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { federationProvider } from "../federation/federationProvider";
import {
  clearPendingFederatedInvitation,
  loadPendingFederatedInvitation,
  PendingFederatedInvitation,
} from "../federation/pendingInvitation";
import { PublicProfile } from "../profile/PublicProfile";
import { publicProfileService } from "../profile/publicProfileService";

const OTHER = "";

// What the invitee has seen of the invitation after redeeming it at the inviting server.
interface Shown {
  invitation: ContactRequest;
  inviter: ContactInfo;
  address: string;
  selfId: string; // own UserId at the inviting server
}

// Accepting an invitation with an account on this server (ADR 0013 A11, F7): the inviting server
// redirected here (Join.tsx), the invitation waits in storage (pendingInvitation.ts).
export default function FederationAccept() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authentication = useAuthentication();
  const { user, settings } = authentication;
  const [pending] = useState<PendingFederatedInvitation | undefined>(() =>
    loadPendingFederatedInvitation(),
  );
  const [publicProfile, setPublicProfile] = useState<PublicProfile>();
  const [emails, setEmails] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [other, setOther] = useState<string>();
  const [shown, setShown] = useState<Shown>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);

  useEffect(() => {
    if (!pending) {
      return;
    }
    publicProfileService
      .loadProfileAndEnsurePublicProfile(user, settings)
      .then(({ publicProfile, profile }) => {
        setPublicProfile(publicProfile);
        setEmails(profile.emails.filter((email) => email));
      })
      .catch((e) => {
        console.error("Failed to load the profile", e);
        setError(t("Could not load your profile."));
      });
  }, [user, settings, pending, t]);

  if (!pending) {
    return (
      <main>
        <article className="border">
          <h5>{t("No invitation found")}</h5>
          <nav>
            <button onClick={() => navigate("/", { replace: true })}>
              {t("Home")}
            </button>
          </nav>
        </article>
      </main>
    );
  }

  // The preselected address: the one signed in with, if it is in the profile, else the first.
  const choice =
    selected ??
    (authentication.email && emails.includes(authentication.email)
      ? authentication.email
      : (emails[0] ?? OTHER));
  // "Other address" starts with the address signed in with: that is where the invitation most
  // likely went, even if the profile does not list it.
  const otherAddress = other ?? authentication.email ?? "";
  const address = (choice === OTHER ? otherAddress : choice).trim();
  const host = new URL(pending.from).host;

  const leave = (path: string) => {
    clearPendingFederatedInvitation();
    navigate(path, { replace: true });
  };

  const show = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const session = await federationProvider().redeemInvitation(
        pending.from,
        pending.token,
        address,
      );
      const requests = await repositoriesFor(
        pending.from,
      ).contacts.getContactRequests(session.userId);
      const open = requests.filter(
        (r) => r.status === "INVITED" && r.invitee === session.userId,
      );
      const invitation =
        open.find((r) => r.inviter === pending.invitedBy) ??
        (open.length === 1 ? open[0] : undefined);
      if (!invitation) {
        setError(t("No matching invitation was found"));
        return;
      }
      setShown({
        invitation,
        inviter: await contactService.readInvitationInfo(invitation, address),
        address,
        selfId: session.userId,
      });
    } catch (e) {
      console.warn("Failed to redeem the invitation", e);
      setError(
        t("The invitation could not be confirmed. Is the address correct?"),
      );
    } finally {
      setBusy(false);
    }
  };

  const accept = async (ownPublicProfile: PublicProfile) => {
    if (!shown) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await contactService.acceptForeignInvitation(
        user,
        pending.from,
        shown.selfId,
        shown.address,
        shown.inviter,
        shown.invitation,
        ownPublicProfile,
        settings,
        authentication.keyPairs.mainKeyPair,
      );
      leave("/chats");
    } catch (e) {
      console.error("Failed to accept the invitation", e);
      setError(t("Could not accept the invitation."));
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!shown) {
      return;
    }
    setBusy(true);
    try {
      await repositoriesFor(pending.from).contacts.declineContactRequest(
        shown.selfId,
        shown.invitation.inviter,
      );
      leave("/");
    } catch (e) {
      console.error("Failed to decline the invitation", e);
      setError(t("Could not decline the invitation."));
      setBusy(false);
    }
  };

  const handleAccept = () => {
    if (publicProfile?.name) {
      accept(publicProfile);
    } else {
      setNamePrompt(true);
    }
  };

  const handleDisplayName = async (name: string) => {
    setNamePrompt(false);
    if (!publicProfile) {
      return;
    }
    try {
      const named = await publicProfileService.setName(
        user,
        publicProfile,
        name,
      );
      setPublicProfile(named);
      await accept(named);
    } catch (e) {
      console.error("Failed to accept the invitation", e);
      setError(t("Could not accept the invitation."));
    }
  };

  return (
    <main>
      <article className="border">
        <h5>{t("Invitation from {{server}}", { server: host })}</h5>
        {shown ? (
          <>
            <p>
              {t("{{name}} on {{server}} invites you.", {
                name: shown.inviter.name ?? shown.inviter.email ?? t("Someone"),
                server: host,
              })}
            </p>
            {shown.inviter.email && shown.inviter.name && (
              <p>{shown.inviter.email}</p>
            )}
            <nav>
              <button disabled={busy || !publicProfile} onClick={handleAccept}>
                {t("Accept")}
              </button>
              <button className="border" disabled={busy} onClick={decline}>
                {t("Decline")}
              </button>
            </nav>
          </>
        ) : (
          <>
            <p className="error-text">
              {t(
                "Only continue if you expect an invitation from {{server}}: it is sent your address.",
                { server: host },
              )}
            </p>
            <p>{t("Address the invitation was sent to")}</p>
            <div className="field border">
              <select
                aria-label={t("Address")}
                value={choice}
                onChange={(e) => setSelected(e.target.value)}
              >
                {emails.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
                <option value={OTHER}>{t("Other address")}</option>
              </select>
            </div>
            {choice === OTHER && (
              <div className="field label border">
                <input
                  id="other-address"
                  value={otherAddress}
                  onChange={(e) => setOther(e.target.value)}
                />
                <label htmlFor="other-address">{t("Address")}</label>
              </div>
            )}
            <nav>
              <button disabled={busy || !address} onClick={show}>
                {t("Show invitation")}
              </button>
              <button
                className="border"
                disabled={busy}
                onClick={() => leave("/")}
              >
                {t("Cancel")}
              </button>
            </nav>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </article>
      {namePrompt && (
        <DisplayNamePrompt
          onConfirm={handleDisplayName}
          onCancel={() => setNamePrompt(false)}
        />
      )}
    </main>
  );
}
