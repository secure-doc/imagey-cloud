import { describe, it, expect, vi, beforeEach } from "vitest";
import { contactRepository } from "../../src/contact/ContactRepository";
import { authenticationRepository } from "../../src/authentication/AuthenticationRepository";
import { cryptoService } from "../../src/authentication/CryptoService";

// Mock dependencies
vi.mock("../../src/authentication/AuthenticationRepository", () => ({
  authenticationRepository: {
    loadPublicMainKey: vi.fn(),
  },
}));
vi.mock("../../src/authentication/CryptoService", () => ({
  cryptoService: {
    generateSymmetricKey: vi.fn(),
    encryptKey: vi.fn(),
  },
}));

describe("ContactRepository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  describe("sendContactRequest", () => {
    it("successfully sends contact request", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);

      await contactRepository.sendContactRequest(
        "sender@example.com",
        "addressee@example.com",
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "/users/sender@example.com/contact-requests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ email: "addressee@example.com" }),
        },
      );
    });

    it("throws error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

      await expect(
        contactRepository.sendContactRequest("a@b.com", "b@c.com"),
      ).rejects.toThrow("Failed to send contact request");
    });
  });

  describe("getContactRequests", () => {
    it("returns contact requests", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ["req1@example.com", "req2@example.com"],
      } as Response);

      const requests =
        await contactRepository.getContactRequests("user@example.com");

      expect(requests).toEqual([
        { email: "req1@example.com" },
        { email: "req2@example.com" },
      ]);
    });

    it("throws error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

      await expect(
        contactRepository.getContactRequests("user@example.com"),
      ).rejects.toThrow("Failed to get contact requests");
    });
  });

  describe("acceptContactRequest", () => {
    it("calculates shared key and sends PUT request", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
      vi.mocked(authenticationRepository.loadPublicMainKey).mockResolvedValue(
        "public-key",
      );
      vi.mocked(cryptoService.generateSymmetricKey).mockResolvedValue({
        kty: "oct",
      } as JsonWebKey);
      vi.mocked(cryptoService.encryptKey).mockResolvedValue(
        "encrypted-shared-key",
      );

      await contactRepository.acceptContactRequest(
        "user@example.com",
        "contact@example.com",
        {} as JsonWebKey,
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "/users/user@example.com/contacts/contact@example.com",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ key: "encrypted-shared-key" }),
        }),
      );
    });

    it("throws error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
      vi.mocked(authenticationRepository.loadPublicMainKey).mockResolvedValue(
        "public-key",
      );

      await expect(
        contactRepository.acceptContactRequest(
          "user@example.com",
          "contact@example.com",
          {} as JsonWebKey,
        ),
      ).rejects.toThrow("Failed to accept contact request");
    });
  });

  describe("declineContactRequest", () => {
    it("sends decline request", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);

      await contactRepository.declineContactRequest(
        "user@example.com",
        "contact@example.com",
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "/users/user@example.com/contact-requests/contact@example.com",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ status: "DECLINED_BY_USER" }),
        }),
      );
    });

    it("throws error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

      await expect(
        contactRepository.declineContactRequest(
          "user@example.com",
          "contact@example.com",
        ),
      ).rejects.toThrow("Failed to decline contact request");
    });
  });

  describe("getContacts", () => {
    it("returns contacts", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ["c1@example.com", "c2@example.com"],
      } as Response);

      const contacts = await contactRepository.getContacts("user@example.com");

      expect(contacts).toEqual([
        { email: "c1@example.com" },
        { email: "c2@example.com" },
      ]);
    });

    it("throws error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

      await expect(
        contactRepository.getContacts("user@example.com"),
      ).rejects.toThrow("Failed to get contact requests");
    });
  });
});
