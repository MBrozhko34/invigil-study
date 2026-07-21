/** METHODOLOGY section 3: transient failures retried <=3 times, expo backoff + jitter; all attempts logged. */
export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
export const MAX_RETRIES = 3;

export interface AttemptLog { attempt: number; httpStatus: number | null; error: string | null; atMs: number; }

export async function withRetry<T>(
  fn: () => Promise<{ ok: true; value: T } | { ok: false; httpStatus: number | null; error: string }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  rand: () => number = Math.random
): Promise<{ value: T | null; attempts: AttemptLog[]; }> {
  const attempts: AttemptLog[] = [];
  for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
    const started = Date.now();
    const res = await fn();
    if (res.ok) {
      attempts.push({ attempt, httpStatus: 200, error: null, atMs: started });
      return { value: res.value, attempts };
    }
    attempts.push({ attempt, httpStatus: res.httpStatus, error: res.error, atMs: started });
    const retryable = res.httpStatus === null || RETRYABLE.has(res.httpStatus);
    if (!retryable || attempt === 1 + MAX_RETRIES) return { value: null, attempts };
    const backoff = Math.min(30000, 1000 * 2 ** (attempt - 1)) * (0.5 + rand());
    await sleep(backoff);
  }
  return { value: null, attempts };
}
