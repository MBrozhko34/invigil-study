/**
 * Canonical JSON: deterministic, byte-stable serialization.
 * Rules (pre-declared, mirrors METHODOLOGY.md section 7 discipline):
 *  - object keys sorted lexicographically (code-unit order)
 *  - no whitespace
 *  - numbers MUST be safe integers; floats are forbidden (encode as strings,
 *    e.g. price "0.27", or scale to integers, e.g. latency_ms)
 *  - undefined / NaN / Infinity / functions / symbols are errors, never dropped silently
 * The evidence log stores exactly these bytes; Merkle leaves hash exactly these bytes.
 */
export type Canonical =
  | string
  | number
  | boolean
  | null
  | Canonical[]
  | { [k: string]: Canonical };

export function canonicalize(v: unknown): string {
  return ser(v, "$");
}

function ser(v: unknown, path: string): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (!Number.isSafeInteger(v as number))
      throw new Error(`canonical JSON: non-integer number at ${path}: ${v}`);
    return String(v);
  }
  if (Array.isArray(v)) return "[" + v.map((x, i) => ser(x, `${path}[${i}]`)).join(",") + "]";
  if (t === "object") {
    const keys = Object.keys(v as object).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const val = (v as Record<string, unknown>)[k];
      if (val === undefined) throw new Error(`canonical JSON: undefined at ${path}.${k}`);
      parts.push(JSON.stringify(k) + ":" + ser(val, `${path}.${k}`));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`canonical JSON: unsupported type ${t} at ${path}`);
}

/** Round-trip check used by the verifier: a stored line must equal canonicalize(parse(line)). */
export function isCanonicalLine(line: string): boolean {
  try {
    return canonicalize(JSON.parse(line)) === line;
  } catch {
    return false;
  }
}
