import { describe, it } from 'node:test'

import { expect } from 'expect'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { renderManifests } from '#src/app/deployments/render/render-manifests.js'

describe('renderManifests', () => {
  const render = () => {
    const app = new AppBuilder()
      .withSlug('my-app')
      .withImage('nginx:1.27')
      .withContainerPort(8080)
      .withReplicas(2)
      .withEnv({ LOG_LEVEL: 'info' })
      .build()
    const release = new ReleaseBuilder().withApp(app).withImageRef('nginx:1.27').build()
    return renderManifests(app, release, 'demo.marsa.cc')
  }

  it('renders a Deployment with the image, port, probes and env', () => {
    const { deployment } = render()

    expect(deployment.metadata?.name).toBe('my-app')
    expect(deployment.spec?.replicas).toBe(2)
    expect(deployment.spec?.selector.matchLabels).toEqual({ app: 'my-app' })

    const container = deployment.spec?.template.spec?.containers[0]
    expect(container?.image).toBe('nginx:1.27')
    expect(container?.ports?.[0].containerPort).toBe(8080)
    expect(container?.env).toEqual([{ name: 'LOG_LEVEL', value: 'info' }])
    expect(container?.readinessProbe?.tcpSocket?.port).toBe(8080)
    expect(container?.livenessProbe?.tcpSocket?.port).toBe(8080)
  })

  it('renders a ClusterIP Service selecting the app', () => {
    const { service } = render()

    expect(service.spec?.type).toBe('ClusterIP')
    expect(service.spec?.selector).toEqual({ app: 'my-app' })
    expect(service.spec?.ports?.[0]).toMatchObject({ port: 8080, targetPort: 8080 })
  })

  it('renders a Traefik IngressRoute with the Host rule and certResolver', () => {
    const { ingressRoute } = render()

    expect(ingressRoute.apiVersion).toBe('traefik.io/v1alpha1')
    expect(ingressRoute.kind).toBe('IngressRoute')
    expect(ingressRoute.spec.entryPoints).toEqual(['web', 'websecure'])
    expect(ingressRoute.spec.routes[0].match).toBe('Host(`my-app.demo.marsa.cc`)')
    expect(ingressRoute.spec.routes[0].services[0]).toEqual({ name: 'my-app', port: 8080 })
    expect(ingressRoute.spec.tls?.certResolver).toBe('le')
  })
})
