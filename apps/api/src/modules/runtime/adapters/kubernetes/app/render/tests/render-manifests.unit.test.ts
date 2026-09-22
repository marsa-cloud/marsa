import { describe, it } from 'node:test'
import { expect } from 'expect'
import { RELEASE_UUID_ANNOTATION } from '#src/modules/runtime/adapters/kubernetes/app/app.constants.js'
import { renderManifests } from '#src/modules/runtime/adapters/kubernetes/app/render/render-manifests.js'
import {
  type AppDeploySpec,
  type NodePinSpec,
  NodePinStrategy,
  type RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const specOf = (overrides: Partial<AppDeploySpec> = {}): AppDeploySpec => ({
  releaseUuid: generateUuid<Uuid<'Release'>>(),
  image: 'nginx:1.27',
  port: 8080,
  env: { LOG_LEVEL: 'info' },
  minReplicas: 0,
  maxReplicas: 3,
  host: 'my-app.demo.marsa.cc',
  nodePin: null,
  ...overrides,
})

describe('renderManifests', () => {
  const render = (credentials?: RegistryCredentials) =>
    renderManifests('my-app', specOf(credentials ? { credentials } : {}))

  it('renders a Deployment with the image, port, probes and env', () => {
    const { deployment } = render()

    expect(deployment.metadata?.name).toBe('my-app')
    expect(deployment.spec?.selector.matchLabels).toEqual({ app: 'my-app' })

    const container = deployment.spec?.template.spec?.containers[0]
    expect(container?.image).toBe('nginx:1.27')
    expect(container?.ports?.[0].containerPort).toBe(8080)
    expect(container?.env).toEqual([{ name: 'LOG_LEVEL', value: 'info' }])
    expect(container?.readinessProbe?.tcpSocket?.port).toBe(8080)
    expect(container?.livenessProbe?.tcpSocket?.port).toBe(8080)
  })

  it('stamps the release uuid on the pod template so every deploy rolls new pods', () => {
    const spec = specOf()

    const { deployment } = renderManifests('my-app', spec)

    expect(deployment.spec?.template.metadata?.annotations).toEqual({
      [RELEASE_UUID_ANNOTATION]: spec.releaseUuid,
    })

    // Same app + image, different release => a different pod template, so k8s
    // replaces the pods instead of treating the apply as a no-op.
    const { deployment: nextDeployment } = renderManifests('my-app', specOf())
    expect(nextDeployment.spec?.template.metadata?.annotations).not.toEqual(
      deployment.spec?.template.metadata?.annotations,
    )
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
    expect(ingressRoute.spec.tls?.certResolver).toBe('le')
  })

  it('omits replicas from the Deployment so KEDA owns the count', () => {
    const { deployment } = render()

    // Absent, not 0. KEDA's HPA owns spec.replicas via the scale subresource;
    // declaring it here makes every redeploy stomp KEDA's live count and the
    // two field managers fight on each apply (AgDR-0043).
    expect(deployment.spec && 'replicas' in deployment.spec).toBe(false)
  })

  it('routes the IngressRoute through the KEDA interceptor', () => {
    const { ingressRoute } = render()

    expect(ingressRoute.spec.routes[0].services[0]).toEqual({
      name: 'keda-add-ons-http-interceptor-proxy',
      namespace: 'keda',
      port: 8080,
    })
  })

  it('renders an HTTPScaledObject carrying the replica range', () => {
    const { httpScaledObject } = render()

    expect(httpScaledObject.apiVersion).toBe('http.keda.sh/v1alpha1')
    expect(httpScaledObject.kind).toBe('HTTPScaledObject')
    expect(httpScaledObject.metadata?.name).toBe('my-app')
    expect(httpScaledObject.spec.hosts).toEqual(['my-app.demo.marsa.cc'])
    expect(httpScaledObject.spec.replicas).toEqual({ min: 0, max: 3 })
    expect(httpScaledObject.spec.scaledownPeriod).toBe(300)
    expect(httpScaledObject.spec.scaleTargetRef).toEqual({
      name: 'my-app',
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      service: 'my-app',
      port: 8080,
    })
  })

  it('renders no pull Secret and no imagePullSecrets for a public image', () => {
    const { deployment, imagePullSecret } = render()

    expect(imagePullSecret).toBeUndefined()
    expect(deployment.spec?.template.spec?.imagePullSecrets).toBeUndefined()
  })

  it('renders a dockerconfigjson Secret and wires imagePullSecrets for a private image', () => {
    const credentials: RegistryCredentials = {
      registry: 'ghcr.io',
      username: 'my-org',
      password: 'pw-test',
    }
    const { deployment, imagePullSecret } = render(credentials)

    expect(imagePullSecret?.metadata?.name).toBe('my-app-registry')
    expect(imagePullSecret?.type).toBe('kubernetes.io/dockerconfigjson')
    expect(deployment.spec?.template.spec?.imagePullSecrets).toEqual([{ name: 'my-app-registry' }])

    const config = JSON.parse(imagePullSecret?.stringData?.['.dockerconfigjson'] ?? '{}')
    const auth = config.auths['ghcr.io']
    expect(auth.username).toBe('my-org')
    expect(auth.password).toBe('pw-test')
    // The load-bearing field: base64("<username>:<password>").
    expect(auth.auth).toBe(Buffer.from('my-org:pw-test').toString('base64'))
  })
})

describe('renderManifests node pinning', () => {
  const render = (nodePin: NodePinSpec | null) => renderManifests('my-app', specOf({ nodePin }))

  it('omits affinity entirely when unpinned', () => {
    const { deployment } = render(null)

    expect(deployment.spec?.template.spec).not.toHaveProperty('affinity')
  })

  it('emits nodeAffinity when pinned', () => {
    const { deployment } = render({
      key: 'kubernetes.io/hostname',
      values: ['node-a'],
      strategy: NodePinStrategy.Required,
    })

    expect(
      deployment.spec?.template.spec?.affinity?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms[0]?.matchExpressions,
    ).toEqual([{ key: 'kubernetes.io/hostname', operator: 'In', values: ['node-a'] }])
  })
})
