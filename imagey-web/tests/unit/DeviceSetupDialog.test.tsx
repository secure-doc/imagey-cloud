import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeviceSetupDialog from "../../src/authentication/DeviceSetupDialog";
import { deviceRepository } from "../../src/device/DeviceRepository";

// Mock dependencies
vi.mock("../../src/device/DeviceRepository", () => ({
  deviceRepository: {
    loadKey: vi.fn(),
  },
}));
vi.mock("../../src/authentication/CryptoService", () => ({
  cryptoService: {
    decryptPrivatePasswordKey: vi.fn(),
  },
}));
vi.mock("../../src/authentication/AuthenticationService", () => ({
  authenticationService: {
    loadPrivateMainKey: vi.fn(),
  },
}));

// Mock dynamically loaded translations by bypassing useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => {
    return {
      t: (str: string) => str,
    };
  },
}));

// Mock the core PasswordDialog to isolate this test from its complex inner workings
vi.mock("../../src/authentication/PasswordDialog", () => {
  return {
    __esModule: true,
    default: ({ message }: { message: string }) => (
      <div data-testid="password-dialog">{message}</div>
    ),
  };
});

describe("DeviceSetupDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders missing key message if private device key is not stored", () => {
    vi.mocked(deviceRepository.loadKey).mockReturnValue(null);

    render(
      <DeviceSetupDialog
        email="test@example.com"
        deviceId="test-device"
        onPrivateKeysDecrypted={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Device key missing, please reregister device"),
    ).toBeInTheDocument();
  });

  it("renders PasswordDialog if private device key is stored", () => {
    vi.mocked(deviceRepository.loadKey).mockReturnValue("encrypted-stored-key");

    render(
      <DeviceSetupDialog
        email="test@example.com"
        deviceId="test-device"
        onPrivateKeysDecrypted={vi.fn()}
      />,
    );

    expect(screen.getByTestId("password-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Input the password for this device"),
    ).toBeInTheDocument();
  });
});
