import type { IncomingMessage, ServerResponse } from "http";

// Minimal shapes that cover what your handler actually uses
export interface VercelRequest extends IncomingMessage {
  body?: any;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: any): void;
  send(body: any): void;
}
