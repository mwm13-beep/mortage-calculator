// src/hooks/types.ts
export type ServerMode = "json-only" | "both-inline" | "both-download";

export type ServerResult = {
  ok: import("../schemas/responseFactory").ResponseOk; // canonical numbers
  pdf?: Blob;       // present for both-* modes
  pdfUrl?: string;  // created object URL for inline display (caller can revoke)
};
export type ServerError = {
  error: string;
  correlationId?: string;
};