/** Normalized request/response types. Every provider quirk collapses to these. */
export type ProbeFamily = "bench" | "greedy" | "logprob" | "context";

export interface CompletionRequest {
  prompt: string;                 // single-turn user content, no system prompt (METHODOLOGY section 4)
  maxTokens: number;
  stop?: string[];
  wantLogprobs?: boolean;         // top-5 where supported
  seed?: number;
}

export interface TokenLogprob {
  token: string;
  logprob: string;                // decimal string -- floats never enter canonical JSON
  top: { token: string; logprob: string }[];
}

export type ResponseStatus = "ok" | "refusal" | "error";

export interface NormalizedResponse {
  status: ResponseStatus;
  httpStatus: number | null;
  text: string;                   // completion text ("" on error)
  finishReason: string | null;
  modelReported: string | null;   // METHODOLOGY section 3: recorded on every request
  logprobs: TokenLogprob[] | null;
  latencyMs: number;
  attempts: number;               // 1 + retries actually used
  error: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null };
}
