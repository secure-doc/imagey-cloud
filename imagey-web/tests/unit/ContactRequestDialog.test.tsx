import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";
import ContactRequestDialog from "../../src/contact/ContactRequestDialog";

// Mock dynamically loaded translations
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (str: string) => str,
  }),
}));

describe("ContactRequestDialog", () => {
  it("renders the dialog correctly", () => {
    render(<ContactRequestDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Add Contact")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("email@imagey.cloud"),
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancelMock = vi.fn();
    render(
      <ContactRequestDialog onConfirm={vi.fn()} onCancel={onCancelMock} />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancelMock).toHaveBeenCalledOnce();
  });

  it("shows error message if email is invalid", () => {
    render(<ContactRequestDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByPlaceholderText("email@imagey.cloud");
    fireEvent.change(input, { target: { value: "invalid-email" } });

    // The validation runs on change. The error text should appear.
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
  });

  it("prevents submission if email is invalid", () => {
    const onConfirmMock = vi.fn();
    render(
      <ContactRequestDialog onConfirm={onConfirmMock} onCancel={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("email@imagey.cloud");
    fireEvent.change(input, { target: { value: "invalid-email" } });
    fireEvent.click(screen.getByText("Confirm"));

    expect(onConfirmMock).not.toHaveBeenCalled();
  });

  it("submits correctly if email is valid", () => {
    const onConfirmMock = vi.fn();
    render(
      <ContactRequestDialog onConfirm={onConfirmMock} onCancel={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("email@imagey.cloud");
    fireEvent.change(input, { target: { value: "valid@example.com" } });
    fireEvent.click(screen.getByText("Confirm"));

    expect(onConfirmMock).toHaveBeenCalledWith("valid@example.com");
  });
});
