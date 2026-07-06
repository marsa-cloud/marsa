/** Field manager that owns the fields Marsa sets via server-side apply (AgDR-0032). */
export const DEPLOY_FIELD_MANAGER = 'marsa-deployer'

/**
 * Single namespace all V0.1 operator apps deploy into (default project /
 * `production` env). Project×Environment namespacing is deferred to V0.2
 * (AgDR-0030); the namespace is derived here, never stored on the entity
 * (AgDR-0029).
 */
export const OPERATOR_APPS_NAMESPACE = 'marsa-apps'

/**
 * Suffix for an app's image-pull Secret name (`<slug><suffix>`), materialized
 * from private-registry credentials and referenced via `imagePullSecrets` (#99).
 */
export const REGISTRY_SECRET_SUFFIX = '-registry'

/** Traefik `IngressRoute` CRD coordinates, for applying it via `CustomObjectsApi`. */
export const TRAEFIK_GROUP = 'traefik.io'
export const TRAEFIK_VERSION = 'v1alpha1'
export const INGRESS_ROUTE_PLURAL = 'ingressroutes'
