import { useState } from "react";
import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair, Settings } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { contactService } from "../contact/ContactService";
import { PublicProfile } from "../profile/PublicProfile";
import { publicProfileService } from "../profile/publicProfileService";

// Sends a contact request, first making sure the sender has a named public
// profile (see docs/plans/chat-public-profile.md §3.6): if one already
// exists, sends right away; otherwise `namePrompt` becomes set so the caller
// can render a DisplayNamePrompt, whose confirmation (confirmDisplayName)
// both names the profile and completes the send. Shared by every "send a
// contact request" entry point (Chats.tsx, NoContactsPanel.tsx).
export function useSendContactRequest(
  user: UserId,
  email: string | undefined,
  mainKeyPair: JsonWebKeyPair | undefined,
  settings: Pick<Settings, "profile" | "settingsKey">,
  onSent: () => void,
): {
  requestContact: (inviteeEmail: string) => Promise<void>;
  namePrompt: PublicProfile | undefined;
  confirmDisplayName: (name: string) => Promise<void>;
  cancelDisplayName: () => void;
} {
  const [pendingInviteeEmail, setPendingInviteeEmail] = useState<string>();
  const [namePrompt, setNamePrompt] = useState<PublicProfile>();

  const send = async (inviteeEmail: string, publicProfile: PublicProfile) => {
    if (!mainKeyPair) {
      return;
    }
    // The inviter owns the chat and picks its id up front (ADR 0015); the
    // chat Document itself is only created once the invitee has accepted.
    const chatId = cryptoService.generateUuid();
    await contactRepository.sendContactRequest(
      user,
      email ?? "",
      inviteeEmail,
      mainKeyPair.publicKey,
      publicProfile.documentId,
      chatId,
      // Lets the invitee show who invited them before accepting.
      await contactService.encryptInvitationInfo(
        { name: publicProfile.name, email },
        inviteeEmail,
        chatId,
      ),
    );
    setPendingInviteeEmail(undefined);
    setNamePrompt(undefined);
    onSent();
  };

  const requestContact = async (inviteeEmail: string) => {
    if (!mainKeyPair) {
      return;
    }
    try {
      const { publicProfile } =
        await publicProfileService.loadProfileAndEnsurePublicProfile(
          user,
          settings,
        );
      if (publicProfile.name) {
        await send(inviteeEmail, publicProfile);
      } else {
        setPendingInviteeEmail(inviteeEmail);
        setNamePrompt(publicProfile);
      }
    } catch (error) {
      console.error("Failed to send contact request", error);
    }
  };

  const confirmDisplayName = async (name: string) => {
    if (!pendingInviteeEmail || !namePrompt) {
      return;
    }
    try {
      // requestContact already resolved (get-or-created) the public profile
      // above - apply the name directly to it rather than re-ensuring
      // (ensurePublicProfile) from scratch, which would now see
      // publicProfileId already set and re-fetch what we already have.
      const publicProfile = await publicProfileService.setName(
        user,
        namePrompt,
        name,
      );
      // Keep the resolved profile (with its fresh ETag) around: if `send`
      // below fails transiently the prompt stays open, and a confirm retry
      // must not re-send `setName` with the now-stale ETag (-> 412, stuck
      // prompt). A repeat setName with the updated object is a harmless no-op.
      setNamePrompt(publicProfile);
      await send(pendingInviteeEmail, publicProfile);
    } catch (error) {
      console.error("Failed to send contact request", error);
    }
  };

  return {
    requestContact,
    namePrompt,
    confirmDisplayName,
    cancelDisplayName: () => {
      setPendingInviteeEmail(undefined);
      setNamePrompt(undefined);
    },
  };
}
