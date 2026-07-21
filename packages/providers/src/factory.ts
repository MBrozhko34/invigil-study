import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadProviderConfig, type ProviderConfig } from "./config.js";
import { OpenAICompatibleAdapter, type FetchLike } from "./openaiCompatible.js";

export function loadAllProviderConfigs(dir: string): ProviderConfig[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => loadProviderConfig(join(dir, f)));
}

export function makeAdapters(configs: ProviderConfig[], fetchImpl?: FetchLike): Map<string, OpenAICompatibleAdapter> {
  const m = new Map<string, OpenAICompatibleAdapter>();
  for (const cfg of configs) {
    if (m.has(cfg.id)) throw new Error(`duplicate provider id ${cfg.id}`);
    m.set(cfg.id, new OpenAICompatibleAdapter(cfg, fetchImpl));
  }
  return m;
}
