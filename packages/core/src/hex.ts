export function toHex(b: Uint8Array): string {
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function fromHex(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) throw new Error(`invalid hex: ${h}`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
