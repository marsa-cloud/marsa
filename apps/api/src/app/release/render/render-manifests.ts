import type { V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import {
  INTERCEPTOR_PORT,
  INTERCEPTOR_SERVICE_NAME,
  KEDA_HTTP_GROUP,
  KEDA_HTTP_VERSION,
  KEDA_NAMESPACE,
  REGISTRY_SECRET_SUFFIX,
  RELEASE_UUID_ANNOTATION,
  SCALEDOWN_PERIOD_SECONDS,
} from '#src/modules/kubernetes/deploy-backend.constants.js'
import type {
  HttpScaledObject,
  IngressRoute,
  RegistryCredentials,
  RenderedManifests,
} from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * A `kubernetes.io/dockerconfigjson` payload — HTTP Basic auth per registry.
 * The `auth` field is the load-bearing one: `base64("<username>:<password>")`.
 */
function buildDockerConfigJson(credentials: RegistryCredentials): string {
  const { registry, username, password } = credentials
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  return JSON.stringify({ auths: { [registry]: { username, password, auth } } })
}

export function renderManifests(
  app: App,
  release: Release,
  baseDomain: string,
  credentials?: RegistryCredentials,
): RenderedManifests {
  const name = app.slug
  const host = `${app.slug}.${baseDomain}`
  const labels = { app: name }
  const env = Object.entries(app.env).map(([key, value]) => ({ name: key, value }))

  const imagePullSecret: V1Secret | undefined = credentials
    ? {
        apiVersion: 'v1',
        kind: 'Secret',
        type: 'kubernetes.io/dockerconfigjson',
        metadata: { name: `${name}${REGISTRY_SECRET_SUFFIX}`, labels },
        stringData: { '.dockerconfigjson': buildDockerConfigJson(credentials) },
      }
    : undefined

  const deployment: V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, labels },
    spec: {
      // No `replicas`: KEDA's HPA owns it via the scale subresource, and a
      // field manager that keeps declaring it fights KEDA on every redeploy.
      selector: { matchLabels: labels },
      template: {
        metadata: { labels, annotations: { [RELEASE_UUID_ANNOTATION]: release.uuid } },
        spec: {
          ...(imagePullSecret?.metadata?.name
            ? { imagePullSecrets: [{ name: imagePullSecret.metadata.name }] }
            : {}),
          containers: [
            {
              name,
              image: release.imageRef,
              ports: [{ containerPort: app.containerPort }],
              env,
              readinessProbe: { tcpSocket: { port: app.containerPort } },
              livenessProbe: { tcpSocket: { port: app.containerPort } },
            },
          ],
        },
      },
    },
  }

  const service: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, labels },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [{ port: app.containerPort, targetPort: app.containerPort }],
    },
  }

  const ingressRoute: IngressRoute = {
    apiVersion: 'traefik.io/v1alpha1',
    kind: 'IngressRoute',
    metadata: { name, labels },
    spec: {
      entryPoints: ['web', 'websecure'],
      routes: [
        {
          match: `Host(\`${host}\`)`,
          kind: 'Rule',
          services: [
            {
              name: INTERCEPTOR_SERVICE_NAME,
              namespace: KEDA_NAMESPACE,
              port: INTERCEPTOR_PORT,
            },
          ],
        },
      ],
      tls: { certResolver: 'le' },
    },
  }

  const httpScaledObject: HttpScaledObject = {
    apiVersion: `${KEDA_HTTP_GROUP}/${KEDA_HTTP_VERSION}`,
    kind: 'HTTPScaledObject',
    metadata: { name, labels },
    spec: {
      hosts: [host],
      scaleTargetRef: {
        name,
        kind: 'Deployment',
        apiVersion: 'apps/v1',
        service: name,
        port: app.containerPort,
      },
      replicas: { min: app.minReplicas, max: app.maxReplicas },
      scaledownPeriod: SCALEDOWN_PERIOD_SECONDS,
    },
  }

  return {
    deployment,
    service,
    ingressRoute,
    httpScaledObject,
    ...(imagePullSecret ? { imagePullSecret } : {}),
  }
}
