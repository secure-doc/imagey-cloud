import { ReactNode, useState } from "react";

interface EditableInputProps {
  id: string;
  value: string;
  fallbackValue?: string;
  label: string;
  type?: string;
  onChange: (value: string) => void;
  onClose?: (value: string) => void;
  startEditing?: boolean;
  children?: ReactNode;
}

export default function EditableInput({
  id,
  value,
  fallbackValue,
  label,
  type = "text",
  onChange,
  onClose,
  startEditing = false,
  children,
}: EditableInputProps) {
  const [isEditing, setIsEditing] = useState(startEditing);

  const handleClose = () => {
    setIsEditing(false);
    if (onClose) onClose(value);
  };

  return (
    <>
      {isEditing ? (
        <>
          <div className="field label suffix border round max">
            <input
              id={id}
              type={type}
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={handleClose}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleClose();
              }}
            />
            <label htmlFor={id}>{label}</label>
            <i
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClose}
              className="front"
            >
              check
            </i>
          </div>
        </>
      ) : (
        <div className="row middle-align max">
          <div
            className="large-text margin-none max mobile-center-text"
            style={{ wordBreak: "break-all" }}
          >
            {value ? (
              value
            ) : (
              <span className="medium-opacity">{fallbackValue || label}</span>
            )}
          </div>
          <button
            className="circle transparent small-margin left-margin"
            onClick={() => setIsEditing(true)}
          >
            <i>edit</i>
          </button>
          {children}
        </div>
      )}
    </>
  );
}
