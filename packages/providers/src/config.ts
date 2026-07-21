import { z } from "zod";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/** configs/providers/*.yaml -- one file per provider endpoint. No provider is hardcoded anywhere. */
export const ProviderConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "lowercase slug"),
  displayName: z.string(),
  baseUrl: z.string().url(),
  /** env var NAME holding the API key -- never the key itself */
  apiKeyEnv: z.string(),
  /** exact model slug this endpoint claims to serve */
  modelSlug: z.string(),
  /** provider-advertised metadata recorded for the report (METHODOLOGY section 3) */
  advertised: z.object({
    precision: z.string().default("unspecified"),
    contextLength: z.number().int().positive(),
    pricePerMtokIn: z.string().default("unknown"),   // decimal string
    pricePerMtokOut: z.string().default("unknown"),
  }),
  capabilities: z.object({
    logprobs: z.boolean().default(false),
    seed: z.boolean().default(false),
    topK: z.boolean().default(false),               // some APIs reject unknown params
    completionsEndpoint: z.boolean().default(false) // raw /v1/completions available
  }),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().positive().default(30),
  }).default({ requestsPerMinute: 30 }),
  timeoutMs: z.number().int().positive().default(120000),
  /** Provider-specific request-body fields merged into every request, e.g.
   *  OpenRouter routing pins: { provider: { order: ["fireworks"], allow_fallbacks: false } }.
   *  Extra fields ONLY -- protocol-critical sampling params can never be overridden. */
  extraBody: z.record(z.unknown()).optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export function loadProviderConfig(path: string): ProviderConfig {
  const raw = parseYaml(readFileSync(path, "utf8"));
  return ProviderConfigSchema.parse(raw);
}
