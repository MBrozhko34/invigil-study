export interface SandboxRequest { code: string; tests: string[]; timeoutS: number; }
export interface SandboxVerdict {
  ok: boolean;               // candidate code loaded without error
  error: string | null;
  results: boolean[];        // per-test pass/fail
  passed: number;
  total: number;
  mode: "docker" | "local";  // recorded in evidence -- local runs are visibly non-production
}
export interface SandboxRunner { run(req: SandboxRequest): Promise<SandboxVerdict>; }
