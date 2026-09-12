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

/**
 * Pod-template annotation carrying the Release a rollout belongs to.
 *
 * Load-bearing, not informational: Kubernetes only replaces pods when the pod
 * template changes. A redeploy of an unchanged image ref would otherwise be a
 * no-op, and the fresh Release would immediately reconcile against the *previous*
 * rollout and report `succeeded`. Stamping the release uuid makes every deploy
 * change the template hash, so mutable tags (`:latest`) actually re-pull.
 */
export const RELEASE_UUID_ANNOTATION = 'marsa.cloud/release-uuid'

/** Traefik `IngressRoute` CRD coordinates, for applying it via `CustomObjectsApi`. */
export const TRAEFIK_GROUP = 'traefik.io'
export const TRAEFIK_VERSION = 'v1alpha1'
export const INGRESS_ROUTE_PLURAL = 'ingressroutes'

/** KEDA HTTP add-on `HTTPScaledObject` CRD coordinates, for `CustomObjectsApi`. */
export const KEDA_HTTP_GROUP = 'http.keda.sh'
export const KEDA_HTTP_VERSION = 'v1alpha1'
export const HTTP_SCALED_OBJECT_PLURAL = 'httpscaledobjects'

/**
 * The add-on's shared interceptor proxy. Every app's IngressRoute points here
 * rather than at the app's own Service: the interceptor holds the request while
 * KEDA scales the app up, which is what makes a cold start survive instead of
 * 502 (AgDR-0043). Cross-namespace, so k3s Traefik needs allowCrossNamespace —
 * shipped by marsa-charts.
 */
export const KEDA_NAMESPACE = 'keda'
export const INTERCEPTOR_SERVICE_NAME = 'keda-add-ons-http-interceptor-proxy'
export const INTERCEPTOR_PORT = 8080

/**
 * Idle time before KEDA scales an app back down to its floor. Platform-wide
 * rather than per-app: per-app scaling config is the correct model but is
 * deferred for scope (AgDR-0043).
 */
export const SCALEDOWN_PERIOD_SECONDS = 300
