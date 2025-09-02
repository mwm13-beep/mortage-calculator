// api/error-helpers.ts
import crypto from "node:crypto";
import { EXPOSE_INTERNAL_ERRORS } from "./env";

export function newReqId() { return crypto.randomUUID(); }

export function log(level: 'info'|'warn'|'error', data: Record<string, unknown>) {
  console[level]?.(JSON.stringify({ ts: new Date().toISOString(), ...data }));
}

// No external knob. Whether to include details is decided *here*.
export function sendError(res: any, status: number, code: string, msg: string, reqId: string, err?: unknown) {
  const body: any = { error: msg, errorCode: code, requestId: reqId };
  if (EXPOSE_INTERNAL_ERRORS && err) {
    const e = err as any;
    body.details = { message: e?.message, stack: e?.stack };
  }
  return res.status(status).json(body);
}
