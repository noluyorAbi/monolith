export const STUDIO_COOKIE = "monolith_studio";

/** Length-safe, branch-free comparison so a wrong key leaks no timing signal. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StudioEnv {
  /** MONOLITH_ADMIN_KEY, when it is configured. */
  key?: string;
  production: boolean;
}

/**
 * Fails closed. An unset key locks the studio in production rather than
 * publishing the order queue to anyone who guesses the path; local development
 * stays open so the bench is usable without ceremony.
 */
export function studioAccess(presented: string | undefined, env: StudioEnv): boolean {
  if (!env.key) return !env.production;
  if (!presented) return false;
  return constantTimeEqual(presented, env.key);
}

export function studioEnv(): StudioEnv {
  return {
    key: process.env.MONOLITH_ADMIN_KEY || undefined,
    production: process.env.NODE_ENV === "production",
  };
}
