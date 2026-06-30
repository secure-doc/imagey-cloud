import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function ProfilePicturePanel({
  picture,
  onPictureChange,
}: {
  picture?: Blob;
  onPictureChange: (file: File) => void;
}) {
  const { t } = useTranslation();
  const initialUrl = picture ? URL.createObjectURL(picture) : undefined;
  const [pictureUrl, setPictureUrl] = useState(initialUrl);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onPictureChange(file);
      setPictureUrl(URL.createObjectURL(file));
    }
  };

  return (
    <div className="s12 m4 l4 center-align">
      <div className="margin-bottom">
        {pictureUrl ? (
          <img
            src={pictureUrl}
            alt="Avatar"
            className="circle responsive small"
          />
        ) : (
          <div className="circle surface center-align middle-align responsive small">
            <i className="extra">person</i>
          </div>
        )}
      </div>
      <div className="space"></div>
      <label className="button border round">
        <span>{t("Change Picture")}</span>
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={handlePictureChange}
        />
      </label>
    </div>
  );
}
