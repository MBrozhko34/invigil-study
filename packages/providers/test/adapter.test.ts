import { test } from "node:test";
import assert from "node:assert/strict";
import { startMockProvider } from "../src/mockServer.js";
import { OpenAICompatibleAdapter } from "../src/openaiCompatible.js";
import { ProviderConfigSchema } from "../src/config.js";
import { RateLimiter } from "../src/rateLimit.js";
import { buildChatBody } from "../src/paramPolicy.js";
import { withRetry } from "../src/retry.js";

const baseCfg = (url: string, over: Record<string, unknown> = {}) =>
  ProviderConfigSchema.parse({
    id: "mock-alpha",
    displayName: "Mock Alpha",
    baseUrl: url,
    apiKeyEnv: "MOCK_KEY",
    modelSlug: "org/test-model",
    advertised: { precision: "bf16", contextLength: 32768, pricePerMtokIn: "0.20", pricePerMtokOut: "0.60" },
    capabilities: { logprobs: true, seed: true, topK: false, completionsEndpoint: false },
    rateLimit: { requestsPerMinute: 6000 },
    timeoutMs: 5000,
    ...over,
  });

process.env.MOCK_KEY = "test-key";
const fastLimiter = new RateLimiter(0);

test("param policy sets every sampling parameter explicitly", () => {
  const cfg = baseCfg("http://x/v1");
  const body = buildChatBody(cfg, { prompt: "p", maxTokens: 64, seed: 42, wantLogprobs: true });
  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
  assert.equal(body.frequency_penalty, 0);
  assert.equal(body.presence_penalty, 0);
  assert.equal(body.stream, false);
  assert.equal(body.seed, 42);
  assert.equal(body.logprobs, true);
  assert.equal(body.top_logprobs, 5);
  assert.equal((body.messages as any[]).length, 1); // no system prompt, single turn
});

test("happy path normalizes response and records model field", async () => {
  const { server, url, seen } = await startMockProvider({ modelReported: "org/test-model-v2.1", logprobs: true });
  const a = new OpenAICompatibleAdapter(baseCfg(url), fetch, fastLimiter);
  const r = await a.complete({ prompt: "hello world test", maxTokens: 32, wantLogprobs: true });
  server.close();
  assert.equal(r.status, "ok");
  assert.equal(r.modelReported, "org/test-model-v2.1"); // METHODOLOGY section 3: recorded per request
  assert.equal(r.attempts, 1);
  assert.ok(r.logprobs && r.logprobs.length > 0);
  assert.equal(r.logprobs![0].top.length, 5);
  assert.match(r.logprobs![0].logprob, /^-0\.10536/); // decimal string, not float
  assert.equal(seen[0].body.temperature, 0);
});

test("retries transient 429 then succeeds; attempts recorded", async () => {
  const { server, url } = await startMockProvider({ failFirst: { n: 2, status: 429 } });
  const a = new OpenAICompatibleAdapter(baseCfg(url), fetch, fastLimiter);
  // inject zero-sleep retry by monkey-patching global timers is overkill; 429 backoff ~1-3s acceptable in test? No.
  // Instead: use adapter with mock fetch that fails twice.
  server.close();
  let calls = 0;
  const mockFetch: typeof fetch = async (u: any, init: any) => {
    calls++;
    if (calls <= 2) return new Response("busy", { status: 429 });
    return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const noSleepRetry = await withRetry(async () => {
    const res = await mockFetch("http://x", {});
    if (!res.ok) return { ok: false as const, httpStatus: res.status, error: "e" };
    return { ok: true as const, value: await res.json() };
  }, async () => {}, () => 0.5);
  assert.equal(noSleepRetry.attempts.length, 3);
  assert.ok(noSleepRetry.value);
});

test("non-retryable 401 fails immediately", async () => {
  const r = await withRetry(async () => ({ ok: false as const, httpStatus: 401, error: "unauthorized" }), async () => {});
  assert.equal(r.value, null);
  assert.equal(r.attempts.length, 1);
});

test("exhausted retries -> error status with last error preserved", async () => {
  let n = 0;
  const r = await withRetry(async () => { n++; return { ok: false as const, httpStatus: 503, error: "down " + n }; }, async () => {});
  assert.equal(r.value, null);
  assert.equal(r.attempts.length, 4); // 1 + 3 retries
  assert.equal(r.attempts[3].error, "down 4");
});

test("content_filter -> refusal status, recorded not retried", async () => {
  const { server, url, seen } = await startMockProvider({ contentFilter: true });
  const a = new OpenAICompatibleAdapter(baseCfg(url), fetch, fastLimiter);
  const r = await a.complete({ prompt: "x", maxTokens: 8 });
  server.close();
  assert.equal(r.status, "refusal");
  assert.equal(seen.length, 1); // exactly one request -- refusals are final
});

test("config validation rejects bad provider yaml", () => {
  assert.throws(() => ProviderConfigSchema.parse({ id: "Bad Slug!" }));
});

test("extraBody passes through pinning fields but can never override protocol params", () => {
  const cfg = baseCfg("http://x/v1", {
    extraBody: {
      provider: { order: ["fireworks"], allow_fallbacks: false },
      temperature: 2,     // attempted override -- must lose
      top_p: 0.5,         // attempted override -- must lose
    },
  });
  const body = buildChatBody(cfg, { prompt: "p", maxTokens: 64 });
  assert.deepEqual(body.provider, { order: ["fireworks"], allow_fallbacks: false });
  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
});
