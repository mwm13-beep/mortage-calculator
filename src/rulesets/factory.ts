// src/rulesets/factory.ts
import type { z } from "zod";
import { makeRounding } from "../engine/rounding";
import type { RulesetShape, BuiltRuleset, AnyRulesetPlugin } from "./types";

export function defineRuleset<E extends z.ZodObject<any>>(
  opts: RulesetShape<E> & { plugin?: AnyRulesetPlugin }
): BuiltRuleset<E> {
  const roundingFns = makeRounding(opts.rounding); // bind once per ruleset
  return Object.freeze({
    ...opts,
    roundingFns,
  });
}
