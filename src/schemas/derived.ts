import { z } from "zod"

export const DerivedByCode = {
  "CA-default": z.object({ insured: z.boolean() }).strict(),
  // "US-default": z.object({ ... }),
  // "UK-default": z.object({ ... }),
} as const;

export type DerivedOf<C extends keyof typeof DerivedByCode> =
  z.infer<(typeof DerivedByCode)[C]>;