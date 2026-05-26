import { useTranslation } from "react-i18next";
import EditableInput from "../components/EditableInput";

export default function ProfileEmailList({
  emails,
  onEmailsChange,
}: {
  emails: string[];
  onEmailsChange: (emalis: string[]) => void;
}) {
  const { t } = useTranslation();

  const addEmail = () => {
    onEmailsChange([...emails, ""]);
  };

  const updateEmail = (index: number, value: string) => {
    const updated = [...emails];
    updated[index] = value;
    onEmailsChange(updated);
  };

  const removeEmail = (index: number) => {
    const updated = emails.filter((_, i) => i !== index);
    onEmailsChange(updated);
  };

  return (
    <>
      <h6>{t("Email Addresses")}</h6>
      <ul className="list margin-bottom">
        {emails.map((email, i) => (
          <li key={i}>
            <i>mail</i>
            <div className="max">
              <EditableInput
                id={`email-${i}`}
                type="email"
                value={email}
                label={t("Email")}
                startEditing={email === ""}
                onChange={(val) => updateEmail(i, val)}
                onClose={(val) => {
                  if (val.trim() === "") {
                    removeEmail(i);
                  }
                }}
              >
                {" "}
                <button
                  className="circle transparent"
                  onClick={() => removeEmail(i)}
                >
                  <i>delete</i>
                </button>
              </EditableInput>{" "}
              <div>{t("unverified")}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="space" />
      <button className="transparent border round" onClick={addEmail}>
        <i>add</i>
        <span>{t("Add Email")}</span>
      </button>
    </>
  );
}
