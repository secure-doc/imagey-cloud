import { useRef } from "react";
import AddIcon from "../icons/AddIcon";

export default function FileChooser({
  multiple,
  onFilesSelected,
}: {
  multiple?: boolean;
  onFilesSelected: (files: FileList) => void;
}) {
  const fileChooser = useRef<HTMLInputElement>(null);
  return (
    <a
      aria-label="add-image"
      className="icon"
      onClick={() => fileChooser.current?.click()}
    >
      <AddIcon key={"add-icon"} />
      <input
        multiple={multiple ?? false}
        ref={fileChooser}
        key="add-image"
        type="file"
        name="images"
        accept="/"
        onChange={() =>
          fileChooser.current &&
          fileChooser.current.files &&
          onFilesSelected(fileChooser.current.files)
        }
      />
    </a>
  );
}
