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
            className="circle"
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              margin: "0 auto",
            }}
          />
        ) : (
          <div
            className="circle surface center-align middle-align"
            style={{ width: 120, height: 120, margin: "0 auto" }}
          >
            <i className="extra">person</i>
          </div>
        )}
      </div>
      <div className="space"></div>
      <button className="border round">
        <span>{t("Change Picture")}</span>
        <input
          type="file"
          accept="image/*"
          onChange={handlePictureChange}
          style={{
            position: "absolute",
            opacity: 0,
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </button>
    </div>
  );
}
