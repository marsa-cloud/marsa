import type { V1Deployment, V1Service } from '@kubernetes/client-node'

import type { App } from '#src/app/deployments/entities/app.entity.js'
import type { Release } from '#src/app/deployments/entities/release.entity.js'
import type {
  IngressRoute,
  RenderedManifests,
} from '#src/modules/kubernetes/deploy-backend.types.js'

export function renderManifests(app: App, release: Release, baseDomain: string): RenderedManifests {
  const name = app.slug
  const host = `${app.slug}.${baseDomain}`
  const labels = { app: name }
  const env = Object.entries(app.env).map(([key, value]) => ({ name: key, value }))

  const deployment: V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, labels },
    spec: {
      replicas: app.replicas,
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
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
          services: [{ name, port: app.containerPort }],
        },
      ],
      tls: { certResolver: 'le' },
    },
  }

  return { deployment, service, ingressRoute }
}
