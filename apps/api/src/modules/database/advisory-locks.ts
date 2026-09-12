// Advisory locks share one global keyspace: two concerns picking the same number would
// silently serialise against each other, so every key the app takes is declared here.
export const AdvisoryLock = {
  // Held while the operator population changes: first-login bootstrap and role updates.
  UserBootstrap: 49170001,
  // Held per migration so concurrently booting replicas apply each one once.
  Migration: 4781002,
} as const
