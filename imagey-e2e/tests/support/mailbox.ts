import { expect } from "@playwright/test";

const mailUrl = () => process.env.E2E_MAIL_URL ?? "http://localhost:8081";

interface GreenmailMessage {
  mimeMessage: string;
  subject: string;
}

// Polls the Greenmail inbox of `email` until a mail with a link whose path matches
// `linkPattern` arrives, and returns that link rewritten to the origin of `baseURL`.
export async function waitForMailLink(
  email: string,
  linkPattern: RegExp,
  baseURL: string,
  { after = 0 }: { after?: number } = {},
): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${mailUrl()}/api/user/${encodeURIComponent(email)}/messages/INBOX`,
        );
        if (!response.ok) {
          return "";
        }
        const messages = (await response.json()) as GreenmailMessage[];
        for (const message of messages.slice(after).reverse()) {
          const found = extractLink(message.mimeMessage, linkPattern);
          if (found) {
            link = found;
            break;
          }
        }
        return link;
      },
      { message: `mail with link ${linkPattern} for ${email}` },
    )
    .not.toBe("");
  const url = new URL(link);
  return new URL(url.pathname + url.search + url.hash, baseURL).toString();
}

// The number of mails currently in the inbox, so that a test can wait for a *new* mail.
export async function mailCount(email: string): Promise<number> {
  const response = await fetch(
    `${mailUrl()}/api/user/${encodeURIComponent(email)}/messages/INBOX`,
  );
  return response.ok ? ((await response.json()) as unknown[]).length : 0;
}

function extractLink(
  mimeMessage: string,
  linkPattern: RegExp,
): string | undefined {
  // Quoted-printable soft line breaks and escaped "=3D" would corrupt the link.
  const text = mimeMessage.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  for (const match of text.matchAll(/https?:\/\/[^\s"<>]+/g)) {
    if (linkPattern.test(new URL(match[0]).pathname)) {
      return match[0].replace(/&amp;/g, "&");
    }
  }
  return undefined;
}
