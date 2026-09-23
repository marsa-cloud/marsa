import { describe, it } from 'node:test'
import { expect } from 'expect'
import { type SinonStub, stub } from 'sinon'
import { ZotImageRegistry } from '#src/modules/runtime/adapters/zot/zot-image-registry.js'

const config = {
  host: 'registry.demo.marsa.cc',
  url: 'http://marsa-registry:5000/',
  pushPassword: 'push-pw',
  pullPassword: 'pull-pw',
}

type Route = (init: RequestInit) => Response

function registryWith(routes: Record<string, Route>) {
  const fetchFn: SinonStub = stub().callsFake((url: string, init: RequestInit) => {
    const route = routes[`${init.method} ${url}`]
    return Promise.resolve(route ? route(init) : new Response(null, { status: 404 }))
  })
  return { registry: new ZotImageRegistry(config, fetchFn as typeof fetch), fetchFn }
}

const tags =
  (...names: string[]): Route =>
  () =>
    Response.json({ name: 'my-app', tags: names })
const digest =
  (value: string): Route =>
  () =>
    new Response(null, { status: 200, headers: { 'Docker-Content-Digest': value } })
const accepted: Route = () => new Response(null, { status: 202 })
const base = 'http://marsa-registry:5000/v2/my-app'

describe('ZotImageRegistry.pullCredentialsFor', () => {
  const { registry } = registryWith({})

  it('returns the read-only pull credentials for an image in Marsa registry', () => {
    expect(registry.pullCredentialsFor('registry.demo.marsa.cc/my-app:abc')).toEqual({
      registry: 'registry.demo.marsa.cc',
      username: 'marsa-pull',
      password: 'pull-pw',
    })
  })

  it('returns nothing for an image elsewhere', () => {
    expect(registry.pullCredentialsFor('ghcr.io/org/app:1')).toBeUndefined()
  })

  it('does not match a host that merely starts with the registry host', () => {
    expect(registry.pullCredentialsFor('registry.demo.marsa.cc.evil.io/app:1')).toBeUndefined()
  })
})

describe('ZotImageRegistry.deleteRepository', () => {
  it('deletes the manifest behind every tag, authenticated as marsa-push', async () => {
    const { registry, fetchFn } = registryWith({
      [`GET ${base}/tags/list`]: tags('a', 'b'),
      [`HEAD ${base}/manifests/a`]: digest('sha256:aaa'),
      [`HEAD ${base}/manifests/b`]: digest('sha256:bbb'),
      [`DELETE ${base}/manifests/sha256:aaa`]: accepted,
      [`DELETE ${base}/manifests/sha256:bbb`]: accepted,
    })

    await registry.deleteRepository('my-app')

    const calls = fetchFn.getCalls().map((call) => `${call.args[1].method} ${call.args[0]}`)
    expect(calls).toContain(`DELETE ${base}/manifests/sha256:aaa`)
    expect(calls).toContain(`DELETE ${base}/manifests/sha256:bbb`)
    const headers = fetchFn.firstCall.args[1].headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('marsa-push:push-pw').toString('base64')}`,
    )
  })

  it('treats a repository the registry does not know as already deleted', async () => {
    const { registry, fetchFn } = registryWith({})

    await registry.deleteRepository('my-app')

    expect(fetchFn.callCount).toBe(1)
  })

  it('skips a tag whose manifest another tag already deleted', async () => {
    const { registry, fetchFn } = registryWith({
      [`GET ${base}/tags/list`]: tags('a', 'b'),
      [`HEAD ${base}/manifests/a`]: digest('sha256:same'),
      [`DELETE ${base}/manifests/sha256:same`]: accepted,
    })

    await registry.deleteRepository('my-app')

    const deletes = fetchFn.getCalls().filter((call) => call.args[1].method === 'DELETE')
    expect(deletes).toHaveLength(1)
  })

  it('fails loudly when the registry refuses', async () => {
    const { registry } = registryWith({
      [`GET ${base}/tags/list`]: () => new Response(null, { status: 403 }),
    })

    await expect(registry.deleteRepository('my-app')).rejects.toThrow(
      "Registry could not list the tags of 'my-app': HTTP 403",
    )
  })
})
