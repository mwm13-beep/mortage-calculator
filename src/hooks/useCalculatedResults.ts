// src/hooks/useCalculatedResults.ts
import { useCallback, useMemo, useState } from "react";
import { createSchemaForRuleset, type OutputOf } from "../schemas/requestFactory";
import { type RulesetCode } from "../rulesets";
import { ResponseUnion, ResponseOk, makeOk } from "../schemas/responseFactory";
import { computeWithDerived } from "../engine";
import type { ServerMode, ServerResult } from "./types";

const GENERIC_ERR = "Something went wrong. Please try again.";

export function useCalculatedResults<C extends RulesetCode>(rulesetCode: C) {
  const schema = useMemo(() => createSchemaForRuleset(rulesetCode), [rulesetCode]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [data,    setData]    = useState<ResponseOk | null>(null);

  // helper: set concise error string
  const setErr = useCallback((msg?: string) => {
    setError(msg && msg.trim() ? msg : GENERIC_ERR);
  }, []);

  // Local: return the ok payload so the caller can immediately update UI
  const computeLocal = useCallback((values: OutputOf<C>): ResponseOk | null => {
    try {
      setError(null);
      const valid = schema.parse(values);
      const engineResult = computeWithDerived(valid);
      const ok = makeOk(engineResult);
      setData(ok);
      return ok;
    } catch (e: any) {
      setData(null);
      setErr(e?.message);
      return null;
    }
  }, [schema, setErr]);

  // JSON first, then PDF (depending on mode). Returns null on any failure.
  const computeServer = useCallback(
    async (mode: ServerMode, values: OutputOf<C>): Promise<ServerResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const valid = schema.parse(values);

        // 1) JSON call
        const jsonResp = await fetch("/api/mortgage", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(valid),
        });

        const jsonText = await jsonResp.text();
        const jsonParsed = jsonText ? (() => { try { return JSON.parse(jsonText); } catch { return {}; } })() : {};
        const parsed = ResponseUnion.safeParse(jsonParsed);

        if (!parsed.success) {
          setData(null);
          setErr(`Unexpected response (HTTP ${jsonResp.status})`);
          return null;
        }
        if ("error" in parsed.data) {
          const cid = parsed.data.correlationId ? ` [${parsed.data.correlationId}]` : "";
          setData(null);
          setErr(`${parsed.data.error}${cid}`);
          return null;
        }

        const ok = parsed.data;
        setData(ok); // keep hook state in sync

        if (mode === "json-only") {
          return { ok };
        }

        // 2) PDF call
        const disposition = mode === "both-inline" ? "inline" : "attachment";
        const pdfResp = await fetch(`/api/pdf?disposition=${disposition}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/pdf" },
          body: JSON.stringify(valid),
        });

        if (!pdfResp.ok) {
          // attempt to read structured error
          let errMsg: string | undefined;
          try {
            const maybeErr = await pdfResp.json();
            if (maybeErr?.error) {
              errMsg = `${maybeErr.error}${maybeErr?.correlationId ? ` [${maybeErr.correlationId}]` : ""}`;
            }
          } catch { /* ignore */ }
          setErr(errMsg ?? `PDF request failed (HTTP ${pdfResp.status})`);
          return null;
        }

        const pdfBlob = await pdfResp.blob();

        if (mode === "both-download") {
          // trigger download
          const url = URL.createObjectURL(pdfBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "mortgage.pdf";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return { ok, pdf: pdfBlob };
        }

        // inline
        const url = URL.createObjectURL(pdfBlob);
        return { ok, pdf: pdfBlob, pdfUrl: url };
      } catch (e: any) {
        setData(null);
        setErr(e?.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [schema, setErr]
  );

  return { computeLocal, computeServer, data, loading, error, schema };
}
