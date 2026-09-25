import type { V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node'
import {
  INTERCEPTOR_PORT,
  INTERCEPTOR_SERVICE_NAME,
  KEDA_HTTP_GROUP,
  KEDA_HTTP_VERSION,
  KEDA_NAMESPACE,
  REGISTRY_SECRET_SUFFIX,
  RELEASE_UUID_ANNOTATION,
  SCALEDOWN_PERIOD_SECONDS,
} from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import type {
  HttpScaledObject,
  IngressRoute,
  RenderedManifests,
} from '#src/modules/runtime/adapters/kubernetes/app/kubernetes-objects.types.js'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'
import { credentialsSecretName } from '#src/modules/runtime/adapters/kubernetes/database/render-credentials-secret.js'
import type { AppDeploySpec, RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

/**
 * A `kubernetes.io/dockerconfigjson` payload — HTTP Basic auth per registry.
 * The `auth` field is the load-bearing one: `base64("<username>:<password>")`.
 */
function buildDockerConfigJson(credentials: RegistryCredentials): string {
  const { registry, username, password } = credentials
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  return JSON.stringify({ auths: { [registry]: { username, password, auth } } })
}

export function renderManifests(slug: string, spec: AppDeploySpec): RenderedManifests {
  const name = slug
  const host = spec.host
  const labels = { app: name }
  const env = [
    ...Object.entries(spec.env).map(([key, value]) => ({ name: key, value })),
    ...spec.attachments.flatMap((attachment) =>
      attachment.keys.map((key) => ({
        name: `${attachment.envPrefix ?? ''}${key}`,
        valueFrom: {
          secretKeyRef: { name: credentialsSecretName(attachment.databaseSlug), key },
        },
      })),
    ),
  ]
  const affinity = buildNodeAffinity(spec.nodePin)
  const credentials = spec.credentials

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
        metadata: { labels, annotations: { [RELEASE_UUID_ANNOTATION]: spec.releaseUuid } },
        spec: {
          ...(affinity ? { affinity } : {}),
          ...(imagePullSecret?.metadata?.name
            ? { imagePullSecrets: [{ name: imagePullSecret.metadata.name }] }
            : {}),
          containers: [
            {
              name,
              image: spec.image,
              ports: [{ containerPort: spec.port }],
              env,
              readinessProbe: { tcpSocket: { port: spec.port } },
              livenessProbe: { tcpSocket: { port: spec.port } },
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
      ports: [{ port: spec.port, targetPort: spec.port }],
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
        port: spec.port,
      },
      replicas: { min: spec.minReplicas, max: spec.maxReplicas },
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
