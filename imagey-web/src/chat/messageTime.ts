// Formatting of server-stamped message times (ADR 0021). `now` is injectable so
// the today/yesterday branches stay testable.

type Translate = (key: string) => string;

// The local calendar day as YYYY-MM-DD - what consecutive messages are grouped by.
export function dayKey(timestamp: string): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatMessageTime(timestamp: string, language: string): string {
  return new Date(timestamp).toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDaySeparator(
  timestamp: string,
  language: string,
  t: Translate,
  now: Date = new Date(),
): string {
  const key = dayKey(timestamp);
  if (key === dayKey(now.toISOString())) {
    return t("Today");
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) {
    return t("Yesterday");
  }
  return new Date(timestamp).toLocaleDateString(language, {
    dateStyle: "medium",
  });
}

// Today: the time of day, otherwise the date - as in common messengers.
export function formatChatListDate(
  date: Date,
  language: string,
  now: Date = new Date(),
): string {
  const iso = date.toISOString();
  return dayKey(iso) === dayKey(now.toISOString())
    ? formatMessageTime(iso, language)
    : date.toLocaleDateString(language);
}
