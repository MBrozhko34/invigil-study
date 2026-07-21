/**
 * The one adapter. Every provider in the study speaks an OpenAI-compatible
 * chat API; per-provider differences live in ProviderConfig, not in code.
 * All failure modes normalize to NormalizedResponse -- nothing throws past
 * this boundary, and nothing goes unrecorded.
 */
import type { ProviderConfig } from "./config.js";
import type { CompletionRequest, NormalizedResponse, TokenLogprob } from "./types.js";
import { buildChatBody } from "./paramPolicy.js";
import { withRetry } from "./retry.js";
import { RateLimiter } from "./rateLimit.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class OpenAICompatibleAdapter {
  private limiter: RateLimiter;
  constructor(
    public readonly cfg: ProviderConfig,
    private fetchImpl: FetchLike = fetch,
    limiter?: RateLimiter
  ) {
    this.limiter = limiter ?? RateLimiter.perMinute(cfg.rateLimit.requestsPerMinute);
  }

  private apiKey(): string {
    const k = process.env[this.cfg.apiKeyEnv];
    if (!k) throw new Error(`missing env ${this.cfg.apiKeyEnv} for provider ${this.cfg.id}`);
    return k;
  }

  async complete(req: CompletionRequest): Promise<NormalizedResponse> {
    await this.limiter.acquire();
    const body = buildChatBody(this.cfg, req);
    const url = this.cfg.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const t0 = Date.now();

    const { value, attempts } = await withRetry<{ json: any; httpStatus: number }>(async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey()}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, httpStatus: res.status, error: `http ${res.status}: ${text.slice(0, 300)}` };
        }
        const json = await res.json();
        return { ok: true, value: { json, httpStatus: res.status } };
      } catch (e: any) {
        return { ok: false, httpStatus: null, error: `network: ${e?.message ?? String(e)}` };
      }
    });

    const latencyMs = Date.now() - t0;

    if (value === null) {
      const last = attempts[attempts.length - 1];
      return {
        status: "error", httpStatus: last.httpStatus, text: "", finishReason: null,
        modelReported: null, logprobs: null, latencyMs, attempts: attempts.length,
        error: last.error, usage: { promptTokens: null, completionTokens: null },
      };
    }

    const j = value.json;
    const choice = j?.choices?.[0];
    const finishReason: string | null = choice?.finish_reason ?? null;
    const text: string = choice?.message?.content ?? "";
    // METHODOLOGY section 3: content refusals are final responses, never retried.
    const status = finishReason === "content_filter" ? "refusal" : "ok";

    return {
      status,
      httpStatus: value.httpStatus,
      text,
      finishReason,
      modelReported: typeof j?.model === "string" ? j.model : null,
      logprobs: extractLogprobs(choice),
      latencyMs,
      attempts: attempts.length,
      error: null,
      usage: {
        promptTokens: intOrNull(j?.usage?.prompt_tokens),
        completionTokens: intOrNull(j?.usage?.completion_tokens),
      },
    };
  }
}

function intOrNull(v: unknown): number | null {
  return Number.isSafeInteger(v) ? (v as number) : null;
}

/** Logprobs -> decimal strings (canonical JSON forbids floats). */
function extractLogprobs(choice: any): TokenLogprob[] | null {
  const content = choice?.logprobs?.content;
  if (!Array.isArray(content)) return null;
  return content.map((c: any) => ({
    token: String(c?.token ?? ""),
    logprob: numToString(c?.logprob),
    top: Array.isArray(c?.top_logprobs)
      ? c.top_logprobs.map((t: any) => ({ token: String(t?.token ?? ""), logprob: numToString(t?.logprob) }))
      : [],
  }));
}
function numToString(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(9) : "nan";
}
