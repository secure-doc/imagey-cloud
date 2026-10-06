// Single entry point for running the E2E suite locally and in CI:
// up -> test -> logs on failure -> down. Extra arguments go to `playwright test`.
// E2E_KEEP=1 keeps the stack running afterwards for debugging.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(
  root,
  "..",
  "imagey-server",
  "target",
  "imagey-server-meecrowave-distribution.zip",
);
const compose = [
  "compose",
  "-p",
  "imagey-e2e",
  "-f",
  join(root, "docker-compose.yml"),
];

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
}

// Thrown instead of exiting, so that the cleanup in `finally` always runs.
class E2eError extends Error {}

function fail(message) {
  throw new E2eError(message);
}

function saveServerLog() {
  const logs = run("docker", [...compose, "logs", "--no-color"]);
  writeFileSync(join(root, "target", "e2e-server.log"), logs.stdout ?? "");
}

// Runs a command asynchronously, so that signals can be forwarded to it while we wait.
// Resolves with the exit code and the collected stderr (which is passed on to ours as well).
function runAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, ...options });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    const forward = (signal) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.once("close", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      resolve({ status: signal ? 1 : (code ?? 1), stderr });
    });
  });
}

function hostPort(service, containerPort) {
  const result = run("docker", [...compose, "port", service, containerPort]);
  const match = /:(\d+)\s*$/m.exec(result.stdout ?? "");
  if (result.status !== 0 || !match) {
    fail(`cannot determine the port of ${service}: ${result.stderr}`);
  }
  return match[1];
}

// A free port, chosen up front: the server only accepts requests from origins listed in its
// secure-doc.urls, so the origin has to be known before it starts.
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const imageContext = join(root, "target", "image");

// A port may be taken between choosing it and binding it. Only that is worth another attempt.
const PORT_CONFLICT = /port is already allocated|address already in use/i;

async function startStack() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const serverPort = await freePort();
    process.env.E2E_SERVER_PORT = String(serverPort);
    // Asynchronous, so that Ctrl+C reaches docker and our cleanup still runs.
    const up = await runAsync(
      "docker",
      [...compose, "up", "-d", "--build", "--wait"],
      { stdio: ["inherit", "inherit", "pipe"] },
    );
    if (up.status === 0) {
      return serverPort;
    }
    saveServerLog();
    if (!PORT_CONFLICT.test(up.stderr ?? "")) {
      fail("docker compose up failed, see target/e2e-server.log");
    }
    run("docker", [...compose, "down", "-v", "--remove-orphans"]);
  }
  return fail("no free port for the server after 3 attempts");
}

let status = 1;
try {
  if (run("docker", ["info"]).status !== 0) {
    fail(
      "Docker is not available. Start Docker, or skip the E2E tests with -DskipE2E.",
    );
  }
  if (!existsSync(bundle)) {
    fail(
      `${bundle} not found. Build imagey-server first (mvn package -pl imagey-server -am).`,
    );
  }
  mkdirSync(imageContext, { recursive: true });
  copyFileSync(
    bundle,
    join(imageContext, "imagey-server-meecrowave-distribution.zip"),
  );
  copyFileSync(join(root, "Dockerfile"), join(imageContext, "Dockerfile"));

  const serverPort = await startStack();
  const env = {
    ...process.env,
    E2E_BASE_URL: `http://localhost:${serverPort}`,
    E2E_MAIL_URL: `http://localhost:${hostPort("greenmail", "8080")}`,
  };
  ({ status } = await runAsync(
    "npx",
    ["playwright", "test", ...process.argv.slice(2)],
    { stdio: "inherit", env },
  ));
  if (status !== 0) {
    saveServerLog();
  }
} catch (error) {
  console.error(error instanceof E2eError ? `E2E: ${error.message}` : error);
} finally {
  if (process.env.E2E_KEEP) {
    console.log(
      "E2E_KEEP is set, the stack keeps running (docker compose -p imagey-e2e down -v)",
    );
  } else {
    // --rmi local: the image is rebuilt on every run, so old ones must not pile up.
    run(
      "docker",
      [...compose, "down", "-v", "--remove-orphans", "--rmi", "local"],
      { stdio: "inherit" },
    );
  }
}
process.exit(status);
