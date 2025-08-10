import { useRef } from "react";

export default function FileChooser({
  multiple,
  onFilesSelected,
}: {
  multiple?: boolean;
  onFilesSelected: (files: FileList) => void;
}) {
  const fileChooser = useRef<HTMLInputElement>(null);
  return (
    <button
      aria-label="add-image"
      className="circle transparent"
      onClick={() => fileChooser.current?.click()}
    >
      <i>add</i>
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
    </button>
  );
}
