// api/env.ts
export type VercelEnv = 'development' | 'preview' | 'production';
export const VERCEL_ENV = (process.env.VERCEL_ENV as VercelEnv | undefined)
  ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');

export const IS_PROD = VERCEL_ENV === 'production';
export const IS_PREVIEW = VERCEL_ENV === 'preview';
export const IS_DEV = VERCEL_ENV === 'development';
export const EXPOSE_INTERNAL_ERRORS = !IS_PROD; // only dev/preview
