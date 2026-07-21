/**
 * Two modes, selected by SANDBOX_MODE:
 *  - docker (production): --network none, cpu/mem/pid caps, read-only fs, nobody user.
 *    Shell-out to the docker CLI rather than dockerode: one fewer dependency,
 *    and the exact isolation flags are visible and auditable in this file.
 *  - local (CI/dev fallback): plain python subprocess. NEVER for study data;
 *    the mode is stamped into every execution record so misuse is detectable.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SandboxRequest, SandboxRunner, SandboxVerdict } from "./types.js";

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "..", "harness.py");
const HARD_WALL_MS = 60_000;

function runProcess(cmd: string, args: string[], stdin: string, mode: "docker" | "local"): Promise<SandboxVerdict> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const kill = setTimeout(() => child.kill("SIGKILL"), HARD_WALL_MS);
    child.stdout.on("data", (d) => { if (out.length < 1_000_000) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 100_000) err += d; });
    child.on("close", (codeNum) => {
      clearTimeout(kill);
      try {
        const j = JSON.parse(out.trim().split("\n").pop() ?? "");
        resolve({ ...j, mode });
      } catch {
        resolve({ ok: false, error: `sandbox process failed (exit ${codeNum}): ${err.slice(0, 300)}`, results: [], passed: 0, total: 0, mode });
      }
    });
    child.on("error", (e) => {
      clearTimeout(kill);
      resolve({ ok: false, error: `spawn: ${e.message}`, results: [], passed: 0, total: 0, mode });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export class DockerSandbox implements SandboxRunner {
  constructor(private image = "invigil-sandbox") {}
  run(req: SandboxRequest): Promise<SandboxVerdict> {
    return runProcess("docker", [
      "run", "--rm", "-i",
      "--network", "none",
      "--cpus", "1",
      "--memory", "512m",
      "--pids-limit", "128",
      "--read-only",
      this.image,
    ], JSON.stringify({ code: req.code, tests: req.tests, timeout_s: req.timeoutS }), "docker");
  }
}

export class LocalSandbox implements SandboxRunner {
  run(req: SandboxRequest): Promise<SandboxVerdict> {
    return runProcess("python3", [HARNESS], JSON.stringify({ code: req.code, tests: req.tests, timeout_s: req.timeoutS }), "local");
  }
}

export function sandboxFromEnv(): SandboxRunner {
  const mode = process.env.SANDBOX_MODE ?? "docker";
  if (mode === "local") return new LocalSandbox();
  return new DockerSandbox();
}
