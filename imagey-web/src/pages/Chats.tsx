import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useActionIcons } from "../contexts/ActionBarContext";
import ContactRequestDialog from "../contact/ContactRequestDialog";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactService } from "../contact/ContactService";

export default function Chats() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const actionIcons = [
    <button
      key="add-contact"
      className="circle transparent"
      onClick={() => setIsDialogOpen(true)}
    >
      <i>add</i>
    </button>,
  ];
  useActionIcons(actionIcons);

  const handleContactRequest = async (email: string) => {
    if (user) {
      try {
        await contactService.sendContactRequest(user, email);
        setIsDialogOpen(false);
      } catch (error) {
        console.error("Failed to send contact request", error);
      }
    }
  };

  return (
    <main>
      <p>{t("No chats available")}</p>
      {isDialogOpen && (
        <ContactRequestDialog
          onConfirm={handleContactRequest}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
    </main>
  );
}
