import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

// Istanbul coverage of the instrumented frontend bundle (imagey-web `npm run build:coverage`,
// swapped into the server image by scripts/run-e2e.mjs). scripts/run-e2e.mjs maps the dumps
// onto the sources afterwards (docs/plans/combined-frontend-coverage.md).
export const coverageDir = path.join(
  import.meta.dirname,
  "..",
  "..",
  "target",
  "coverage-istanbul",
  "e2e",
);

interface FileCoverage {
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
}
type Counters = Record<string, FileCoverage>;
type Coverage = Record<string, FileCoverage & Record<string, unknown>>;

// window.__coverage__ lives as long as the document: every navigation (mail links, reloads)
// starts from zero. So each document reports its counters to Node, on pagehide and
// periodically; the maps of the statements (large, and the same in every document) are sent once.
const REPORT = "__imageyReportCoverage";
const INIT_SCRIPT = `(() => {
  const id = Math.random().toString(36).slice(2);
  let mapsSent = false;
  let last = "";
  const report = () => {
    const coverage = window.__coverage__;
    if (!coverage || typeof window.${REPORT} !== "function") return;
    const counters = {};
    for (const [file, c] of Object.entries(coverage)) {
      counters[file] = { s: c.s, f: c.f, b: c.b };
    }
    const json = JSON.stringify(counters);
    if (json === last && mapsSent) return;
    last = json;
    window.${REPORT}(id, json, mapsSent ? null : JSON.stringify(coverage));
    mapsSent = true;
  };
  window.__imageyFlush = report;
  window.addEventListener("pagehide", report);
  setInterval(report, 2000);
})();`;

// One entry per test (worker process): documents of all pages.
const documents = new Map<string, Counters>();
const maps = new Map<string, Record<string, unknown>>();
const tracked = new Set<Page>();

// Measures every page of the context, also those opened later.
export async function measureCoverage(context: BrowserContext): Promise<void> {
  await context.exposeFunction(
    REPORT,
    (id: string, counters: string, full: string | null) => {
      documents.set(id, JSON.parse(counters) as Counters);
      if (full) {
        for (const [file, c] of Object.entries(JSON.parse(full) as Coverage)) {
          if (!maps.has(file)) {
            maps.set(file, c);
          }
        }
      }
    },
  );
  await context.addInitScript(INIT_SCRIPT);
  context.on("page", (page) => tracked.add(page));
}

// Collects what the open pages have not reported yet and writes one dump per document.
// Call this before closing the contexts.
export async function saveCoverage(): Promise<void> {
  await Promise.all(
    [...tracked]
      .filter((page) => !page.isClosed())
      .map((page) =>
        page
          .evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__imageyFlush?.();
          })
          .catch(() => undefined),
      ),
  );
  tracked.clear();
  // The reports are messages from the pages; let the last ones arrive.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const dumps = [...documents.values()].map((counters) => {
    const coverage: Coverage = {};
    for (const [file, c] of Object.entries(counters)) {
      coverage[file] = { ...maps.get(file), ...c };
    }
    return coverage;
  });
  documents.clear();
  maps.clear();
  if (dumps.length > 0) {
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(
      path.join(coverageDir, `coverage-${randomUUID()}.json`),
      JSON.stringify(dumps),
    );
  }
}
