/** Field manager that owns the fields Marsa sets via server-side apply (AgDR-0032). */
export const DEPLOY_FIELD_MANAGER = 'marsa-deployer'

/**
 * Single namespace all V0.1 operator apps deploy into (default project /
 * `production` env). Project×Environment namespacing is deferred to V0.2
 * (AgDR-0030); the namespace is derived here, never stored on the entity
 * (AgDR-0029).
 */
export const OPERATOR_APPS_NAMESPACE = 'marsa-apps'

/** Traefik `IngressRoute` CRD coordinates, for applying it via `CustomObjectsApi`. */
export const TRAEFIK_GROUP = 'traefik.io'
export const TRAEFIK_VERSION = 'v1alpha1'
export const INGRESS_ROUTE_PLURAL = 'ingressroutes'
