/**
 * In-process OpenAI-compatible mock used by tests and the E2E dry run.
 * Configurable quirks let us exercise every branch of the adapter.
 */
import { createServer, type Server } from "node:http";

export interface MockBehavior {
  /** fail the first N requests with this status before succeeding */
  failFirst?: { n: number; status: number };
  contentFilter?: boolean;
  modelReported?: string;
  replyFor?: (prompt: string, body: any) => string;
  logprobs?: boolean;
  latencyMs?: number;
}

export function startMockProvider(behavior: MockBehavior = {}): Promise<{ server: Server; url: string; seen: any[] }> {
  const seen: any[] = [];
  let failures = 0;
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", async () => {
      const body = JSON.parse(data || "{}");
      seen.push({ url: req.url, body });
      if (behavior.latencyMs) await new Promise((r) => setTimeout(r, behavior.latencyMs));
      if (behavior.failFirst && failures < behavior.failFirst.n) {
        failures++;
        res.writeHead(behavior.failFirst.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "induced failure" } }));
        return;
      }
      const prompt: string = body?.messages?.[0]?.content ?? "";
      const text = behavior.replyFor ? behavior.replyFor(prompt, body) : "mock reply to: " + prompt.slice(0, 40);
      const payload: any = {
        id: "mock-1",
        model: behavior.modelReported ?? body.model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: behavior.contentFilter ? "" : text },
          finish_reason: behavior.contentFilter ? "content_filter" : "stop",
          ...(behavior.logprobs && body.logprobs
            ? { logprobs: { content: text.split(/\s+/).slice(0, 5).map((tok: string) => ({
                token: tok, logprob: -0.105360516,
                top_logprobs: [
                  { token: tok, logprob: -0.105360516 },
                  { token: "alt1", logprob: -2.995732274 },
                  { token: "alt2", logprob: -4.605170186 },
                  { token: "alt3", logprob: -5.298317367 },
                  { token: "alt4", logprob: -6.214608098 },
                ] })) } }
            : {}),
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}/v1`, seen });
    });
  });
}
