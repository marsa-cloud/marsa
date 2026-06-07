import { afterEach, before, describe, it } from 'node:test'

import { expect } from 'expect'
import sinon from 'sinon'

import { GitHubManifestClient } from '#src/app/github-app/github-manifest.client.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function fakeResponse(init: Partial<Response> & { json?: () => Promise<unknown> }): Response {
  return init as unknown as Response
}

describe('GitHubManifestClient', () => {
  before(() => TestBench.setupUnitTest())
  afterEach(() => sinon.restore())

  it('maps a successful conversion response', async () => {
    const payload = {
      id: 123,
      slug: 'marsa-x',
      name: 'marsa.x',
      html_url: 'https://github.com/apps/marsa-x',
      owner: { login: 'octo' },
      client_id: 'cid',
      client_secret: 'csecret',
      webhook_secret: 'wsecret',
      pem: 'PEM',
    }
    sinon
      .stub(globalThis, 'fetch')
      .resolves(fakeResponse({ ok: true, json: () => Promise.resolve(payload) }))

    const creds = await new GitHubManifestClient().convertManifest('code123')

    expect(creds.id).toBe(123)
    expect(creds.ownerLogin).toBe('octo')
    expect(creds.clientSecret).toBe('csecret')
    expect(creds.htmlUrl).toBe('https://github.com/apps/marsa-x')
  })

  it('defaults ownerLogin to null when owner is absent', async () => {
    const payload = {
      id: 1,
      slug: 's',
      name: 'n',
      html_url: 'u',
      client_id: 'c',
      client_secret: 'cs',
      webhook_secret: 'ws',
      pem: 'p',
    }
    sinon
      .stub(globalThis, 'fetch')
      .resolves(fakeResponse({ ok: true, json: () => Promise.resolve(payload) }))

    const creds = await new GitHubManifestClient().convertManifest('x')

    expect(creds.ownerLogin).toBeNull()
  })

  it('throws on a non-ok response', async () => {
    sinon
      .stub(globalThis, 'fetch')
      .resolves(
        fakeResponse({ ok: false, status: 422, text: () => Promise.resolve('unprocessable') }),
      )

    await expect(new GitHubManifestClient().convertManifest('x')).rejects.toThrow(/422/)
  })
})
