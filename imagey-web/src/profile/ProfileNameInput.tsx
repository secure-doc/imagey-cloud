import { useTranslation } from "react-i18next";
import EditableInput from "../components/EditableInput";

export default function ProfileNameInput({
  name,
  fallback,
  onNameChange,
}: {
  name: string;
  fallback: string;
  onNameChange: (name: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="margin-bottom">
      <EditableInput
        id="name"
        value={name}
        fallbackValue={fallback}
        label={t("Name")}
        onChange={onNameChange}
      />
    </div>
  );
}
