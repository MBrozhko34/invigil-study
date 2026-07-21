/** Pull the first fenced Python block from a completion; fall back to whole text. */
export function extractPython(text: string): string {
  const fence = /```(?:python|py)?\s*\n([\s\S]*?)```/m.exec(text);
  if (fence) return fence[1];
  return text;
}
