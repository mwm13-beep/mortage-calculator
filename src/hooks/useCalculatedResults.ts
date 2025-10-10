import { useCallback, useMemo, useState } from "react";
import { createSchemaForRuleset } from "../schemas/schemaFactory";
import type { RulesetCode } from "../rulesets";
import type { OutputOf } from "../schemas/schemaFactory";
import type { EngineResult } from "../engine/types";

export function useCalculatedResults(rulesetCode: RulesetCode) {
  const schema = useMemo(() => createSchemaForRuleset(rulesetCode), [rulesetCode]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EngineResult | null>(null);

  const compute = useCallback(async (values: OutputOf<any>) => {
    setLoading(true); setError(null);
    try {
      const valid = schema.parse(values);
      const resp = await fetch("/api/mortgage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as EngineResult;
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to compute");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [schema]);

  return { compute, data, loading, error };
}
