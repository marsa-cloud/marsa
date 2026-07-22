/**
 * How an App is addressed publicly. Discriminated on `type` so the deploy step
 * can render the right ingress rule. v0.1 only ever produces `subdomain`; the
 * `custom` arm is reserved on the same column so custom-domain support lands as
 * a new value, not a schema migration (AgDR-0015).
 */
export type AppDomain = { type: 'subdomain' } | { type: 'custom'; host: string }
