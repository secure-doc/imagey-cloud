import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../hooks/useObjectUrl";

// A fixed square box: Beer CSS' "responsive small" is 100% wide but only 8rem
// high, which turns the circle into a squashed ellipse.
const AVATAR_STYLE = {
  width: 120,
  height: 120,
  objectFit: "cover",
  margin: "0 auto",
} as const;

export default function ProfilePicturePanel({
  picture,
  onPictureChange,
}: {
  picture?: Blob;
  onPictureChange: (file: File) => void;
}) {
  const { t } = useTranslation();
  // A freshly picked file is shown immediately, before it is saved and comes
  // back as `picture`.
  const [pickedFile, setPickedFile] = useState<File | undefined>();
  const pictureUrl = useObjectUrl(pickedFile ?? picture);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPickedFile(file);
      onPictureChange(file);
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
            style={AVATAR_STYLE}
          />
        ) : (
          <div
            className="circle surface center-align middle-align"
            style={AVATAR_STYLE}
          >
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
