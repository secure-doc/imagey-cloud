// Merges the per-test istanbul coverage written by tests/integration/fixtures.ts
// (.coverage-raw/*.json), maps it back to the original sources, generates the
// lcov/html reports and enforces the coverage gate.
import fs from "node:fs";
import path from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import libSourceMaps from "istanbul-lib-source-maps";
import reports from "istanbul-reports";

const rawDir = ".coverage-raw";
const outputDir = "coverage";
const thresholds = { branches: 90, lines: 95, statements: 95, functions: 95 };
const excluded = [
  /\.d\.[cm]?ts$/,
  /src[\\/]serviceWorkerRegistration\.ts$/,
  /src[\\/]sw\.ts$/,
];

const files = fs.existsSync(rawDir)
  ? fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"))
  : [];
if (files.length === 0) {
  console.error(`No coverage data found in ${rawDir}`);
  process.exit(1);
}

const merged = libCoverage.createCoverageMap({});
for (const file of files) {
  merged.merge(JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8")));
}

// The instrumented code is lowered TS/JSX; map the counters back to the
// original source lines via the source map embedded in each coverage entry.
const mapped = await libSourceMaps
  .createSourceMapStore()
  .transformCoverage(merged);
const srcDir = path.resolve("src") + path.sep;
const coverageMap = libCoverage.createCoverageMap({});
for (const file of mapped.files()) {
  if (file.startsWith(srcDir) && !excluded.some((e) => e.test(file))) {
    coverageMap.addFileCoverage(mapped.fileCoverageFor(file));
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
const context = libReport.createContext({ dir: outputDir, coverageMap });
for (const name of ["lcovonly", "html", "text-summary"]) {
  reports.create(name).execute(context);
}

const summary = coverageMap.getCoverageSummary().toJSON();
const failures = Object.entries(thresholds)
  .filter(([metric, min]) => summary[metric].pct < min)
  .map(([metric, min]) => `${metric}: ${summary[metric].pct}% < ${min}%`);
if (failures.length > 0) {
  console.error(`Coverage gate failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
