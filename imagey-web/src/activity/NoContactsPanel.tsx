import { useState } from "react";
import { useTranslation } from "react-i18next";

import ContactRequestDialog from "../contact/ContactRequestDialog";
import DisplayNamePrompt from "../contact/DisplayNamePrompt";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useSendContactRequest } from "../hooks/useSendContactRequest";
import { getAppName } from "../utils/appName";
import Panel from "../components/Panel";

export default function NoContactsPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs?.mainKeyPair;
  const settings = authentication.settings;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { requestContact, namePrompt, confirmDisplayName, cancelDisplayName } =
    useSendContactRequest(
      user,
      authentication.email,
      mainKeyPair,
      settings,
      () => setIsDialogOpen(false),
    );

  return (
    <>
      <Panel
        className={className}
        title={t("No contacts yet?")}
        image={
          <div className="padding center-align">
            <i className="extra">group_add</i>
          </div>
        }
        actions={
          <button className="primary" onClick={() => setIsDialogOpen(true)}>
            <i>person_add</i>
            <span>{t("Invite Contact")}</span>
          </button>
        }
      >
        <p className="center-align">
          {t(
            "Invite someone to {{appName}} to start sharing images and more!",
            { appName: getAppName() },
          )}
        </p>
      </Panel>

      {isDialogOpen && (
        <ContactRequestDialog
          onConfirm={(email) => {
            // Close now - a DisplayNamePrompt (§3.6) may open right behind
            // it, and the two must not show at the same time.
            setIsDialogOpen(false);
            requestContact(email);
          }}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
      {namePrompt && (
        <DisplayNamePrompt
          onConfirm={confirmDisplayName}
          onCancel={cancelDisplayName}
        />
      )}
    </>
  );
}
