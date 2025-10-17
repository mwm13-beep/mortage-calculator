import { useCallback, useMemo, useState } from "react";
import { createSchemaForRuleset, type OutputOf } from "../schemas/requestFactory";
import { type RulesetCode } from "../rulesets";
import { ResponseUnion, ResponseOk, makeOk } from "../schemas/responseFactory";
import { computeWithDerived } from "../engine";

/**
 * Validates with the request schema, then:
 * - computeLocal: runs the engine locally and returns ResponseOk shape
 * - computeApi: POSTs to /api/mortgage and returns ResponseOk shape
 */
export function useCalculatedResults<C extends RulesetCode>(rulesetCode: C) {
  const schema = useMemo(() => createSchemaForRuleset(rulesetCode), [rulesetCode]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [data,    setData]    = useState<ResponseOk | null>(null);

  const computeLocal = useCallback((values: OutputOf<C>): ResponseOk => {
    setError(null);
    const valid = schema.parse(values);                // same coercions/rounding as server
    const engineResult = computeWithDerived(valid);    // engine returns canonical numbers + derived
    const ok = makeOk(engineResult);                   // same wire shape as API
    setData(ok);
    return ok;
  }, [schema]);

  const computeApi = useCallback(async (values: OutputOf<C>) => {
    setLoading(true);
    setError(null);
    try {
      const valid = schema.parse(values);

      const resp = await fetch("/api/mortgage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });

      const json = await resp.json().catch(() => ({}));
      const parsed = ResponseUnion.safeParse(json);

      if (!parsed.success) {
        throw new Error(`Unexpected response shape (HTTP ${resp.status})`);
      }
      if ("error" in parsed.data) {
        const cid = parsed.data.correlationId ? ` [${parsed.data.correlationId}]` : "";
        setError(`${parsed.data.error}${cid}`);
        setData(null);
        return null;
      }

      setData(parsed.data);
      return parsed.data;
    } catch (e: any) {
      setError(e?.message ?? "Failed to compute");
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [schema]);

  return { computeLocal, computeApi, data, loading, error, schema };
}
