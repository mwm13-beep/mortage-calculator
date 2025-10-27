// src/pdf/sanitize.ts
// Drop non-primitive or unexpected fields, clamp string lengths.
export function dropUnknown(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};

  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(o)) {
    if (typeof k !== "string") continue;

    if (typeof v === "string") {
      // clamp long strings so a giant payload can’t bloat a PDF
      out[k] = v.slice(0, 200);
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      // allow small primitives as-is
      out[k] = v;
    }
    // else: skip arrays, objects, functions, symbols, undefined
  }

  return out;
}
