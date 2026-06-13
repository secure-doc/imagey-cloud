import { useState } from "react";
import { useTranslation } from "react-i18next";

import ContactRequestDialog from "../contact/ContactRequestDialog";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactRepository } from "../contact/ContactRepository";
import { getAppName } from "../utils/appName";
import Panel from "../components/Panel";

export default function NoContactsPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleContactRequest = async (email: string) => {
    if (user) {
      try {
        await contactRepository.sendContactRequest(user, email);
        setIsDialogOpen(false);
      } catch (error) {
        console.error("Failed to send contact request", error);
      }
    }
  };

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
          onConfirm={handleContactRequest}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
    </>
  );
}
