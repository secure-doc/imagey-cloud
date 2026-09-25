import { useState } from "react";
import { ContactRequest } from "../contact/ContactRequest";
import { contactService } from "../contact/ContactService";
import DisplayNamePrompt from "../contact/DisplayNamePrompt";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { ContactEntry } from "../document/DocumentMetadata";
import { PublicProfile } from "../profile/PublicProfile";
import { publicProfileService } from "../profile/publicProfileService";

export default function AcceptInvitationButton({
  className = "",
  user,
  invitation,
  onAccepted,
}: {
  className?: string;
  user: string;
  // The INVITED request: the inviter, the chat id they chose (ADR 0015),
  // their public main key and "public-profile" Document id (may be absent,
  // see docs/plans/chat-public-profile.md §4) and their encrypted name/address.
  invitation: Pick<
    ContactRequest,
    "inviter" | "chatId" | "publicKey" | "publicProfileId" | "contactInfo"
  >;
  onAccepted: (contact: ContactEntry) => void;
}) {
  const authentication = useAuthentication();
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const settings = authentication.settings;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set while waiting on a DisplayNamePrompt (§3.6): we don't have a named
  // public-profile of our own yet, so accepting is held until it is named.
  const [namePrompt, setNamePrompt] = useState<PublicProfile>();

  const accept = async (ownPublicProfile: PublicProfile) => {
    setBusy(true);
    setFailed(false);
    try {
      const newContact = await contactService.acceptContactRequest(
        user,
        invitation,
        authentication.email,
        ownPublicProfile,
        settings,
        mainKeyPair,
      );
      onAccepted(newContact);
    } catch (e) {
      console.error("Failed to accept contact request", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const handleClick = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { publicProfile } =
        await publicProfileService.loadProfileAndEnsurePublicProfile(
          user,
          settings,
        );
      if (publicProfile.name) {
        await accept(publicProfile);
      } else {
        setBusy(false);
        setNamePrompt(publicProfile);
      }
    } catch (e) {
      console.error("Failed to accept contact request", e);
      setFailed(true);
      setBusy(false);
    }
  };

  const handleDisplayNameConfirm = async (name: string) => {
    if (!namePrompt) {
      return;
    }
    setNamePrompt(undefined);
    setBusy(true);
    try {
      // handleClick already resolved (get-or-created) the public profile
      // above - apply the name directly to it rather than re-ensuring
      // (ensurePublicProfile) from scratch, which would now see
      // publicProfileId already set and re-fetch what we already have.
      const publicProfile = await publicProfileService.setName(
        user,
        namePrompt,
        name,
      );
      await accept(publicProfile);
    } catch (e) {
      console.error("Failed to accept contact request", e);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`${className} circle transparent`}
        disabled={busy}
        onClick={handleClick}
      >
        <i>{failed ? "error" : "check"}</i>
      </button>
      {namePrompt && (
        <DisplayNamePrompt
          onConfirm={handleDisplayNameConfirm}
          onCancel={() => setNamePrompt(undefined)}
        />
      )}
    </>
  );
}
