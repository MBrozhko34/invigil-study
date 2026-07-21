/**
 * METHODOLOGY section 3 "Request protocol" as code. Every sampling parameter is
 * set EXPLICITLY on every request -- provider defaults are a confounder.
 * This function is the single place request bodies are built; probes cannot
 * construct raw bodies themselves.
 */
import type { CompletionRequest } from "./types.js";
import type { ProviderConfig } from "./config.js";

export function buildChatBody(cfg: ProviderConfig, req: CompletionRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: cfg.modelSlug,
    messages: [{ role: "user", content: req.prompt }], // single-turn, no system prompt
    temperature: 0,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: req.maxTokens,
    stream: false,
    n: 1,
  };
  if (req.stop && req.stop.length > 0) body.stop = req.stop;
  if (cfg.capabilities.topK) body.top_k = 1;
  if (cfg.capabilities.seed && req.seed !== undefined) body.seed = req.seed;
  if (req.wantLogprobs && cfg.capabilities.logprobs) {
    body.logprobs = true;
    body.top_logprobs = 5;
  }
  // Provider-specific extras (e.g. OpenRouter provider.order / allow_fallbacks).
  // Additive only: a key already set by the protocol above is never overridden,
  // preserving the invariant that METHODOLOGY section 3 params are enforced here.
  if (cfg.extraBody) {
    for (const [k, v] of Object.entries(cfg.extraBody)) {
      if (!(k in body)) body[k] = v;
    }
  }
  return body;
}
