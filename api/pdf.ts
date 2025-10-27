// api/pdf.ts
export const config = { runtime: "edge" };

import { createSchemaForRuleset } from "../src/schemas/requestFactory";
import { isRulesetCode } from "../src/rulesets";
import { computeResultsDynamic } from "../src/engine";
import { makeOk } from "../src/schemas/responseFactory";
import { renderMortgagePdf } from "../src/pdf/templates";
import {
  baseHeaders, guardMethod, guardJson, parseJsonBody,
  applyRateLimit, sendError
} from "./_util/http";

export default async function handler(req: Request): Promise<Response> {
  const t0 = Date.now();
  const headers = baseHeaders(req); // no content-type here; final is PDF

  const m = guardMethod(req, headers, "POST"); if (m) return m;
  const c = guardJson(req); if (c) return c;
  const r = await applyRateLimit(req, headers); if (r) return r;

  try {
    const rawBody = await parseJsonBody(req);

    const code = isRulesetCode(rawBody?.rulesetCode) ? (rawBody as any).rulesetCode : "CA-Default";
    const schema = createSchemaForRuleset(code);
    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      return sendError(req, 400, "VALIDATION_ERROR", { msg: "Request failed input validation" });
    }

    const result = computeResultsDynamic(parsed.data);
    const ok = makeOk(result);

    const bytes = renderMortgagePdf(ok, code);
    const url = new URL(req.url);
    const disp = (url.searchParams.get("disposition") || "inline").toLowerCase();

    const pdfHeaders = new Headers(headers);
    pdfHeaders.set("Content-Type", "application/pdf");
    pdfHeaders.set(
      "Content-Disposition",
      disp === "attachment" ? 'attachment; filename="mortgage.pdf"' : 'inline; filename="mortgage.pdf"'
    );
    pdfHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    pdfHeaders.set("Pragma", "no-cache");

    const stream = new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    });
    pdfHeaders.set("X-Duration-MS", String(Date.now() - t0));
    return new Response(stream, { status: 200, headers: pdfHeaders });
  } catch (e: any) {
    const http = e?.http ?? 500;
    const code = (e?.code as any) ?? "INTERNAL_SERVER_ERROR";
    return sendError(req, http, code, { msg: e?.msg, err: e });
  }
}
