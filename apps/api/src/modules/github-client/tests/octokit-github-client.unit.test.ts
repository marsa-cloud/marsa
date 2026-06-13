import { afterEach, before, describe, it } from 'node:test'

import { expect } from 'expect'
import sinon from 'sinon'

import type {
  AppAuthFactory,
  GitHubManifestConversionResponse,
} from '#src/modules/github-client/github-client.types.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'
import { TestBench } from '#src/test/setup/test-bench.js'

/**
 * Builds a fake `createAppAuth` factory that records how many times it's called
 * and what installation ids the returned auth fn receives. `auth(...)` resolves
 * (or rejects) per `tokenOrError`.
 */
function fakeFactory(tokenOrError: string | Error): {
  factory: AppAuthFactory
  factoryCalls: () => number
  installationIds: () => unknown[]
} {
  let calls = 0
  const ids: unknown[] = []
  const factory = ((): unknown => {
    calls++
    return (options: { installationId?: unknown }) => {
      ids.push(options.installationId)
      return tokenOrError instanceof Error
        ? Promise.reject(tokenOrError)
        : Promise.resolve({ token: tokenOrError })
    }
  }) as unknown as AppAuthFactory

  return { factory, factoryCalls: () => calls, installationIds: () => ids }
}

function fakeResponse(init: Partial<Response> & { json?: () => Promise<unknown> }): Response {
  return init as unknown as Response
}

describe('OctokitGithubClient', () => {
  before(() => TestBench.setupUnitTest())
  afterEach(() => sinon.restore())

  describe('convertManifest', () => {
    it('maps a successful conversion response', async () => {
      const payload: GitHubManifestConversionResponse = {
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

      const creds = await new OctokitGithubClient().convertManifest('code123')

      expect(creds.id).toBe(123)
      expect(creds.ownerLogin).toBe('octo')
      expect(creds.clientSecret).toBe('csecret')
      expect(creds.htmlUrl).toBe('https://github.com/apps/marsa-x')
    })

    it('defaults ownerLogin to null when owner is absent', async () => {
      const payload: GitHubManifestConversionResponse = {
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

      const creds = await new OctokitGithubClient().convertManifest('x')

      expect(creds.ownerLogin).toBeNull()
    })

    it('throws on a non-ok response', async () => {
      sinon
        .stub(globalThis, 'fetch')
        .resolves(
          fakeResponse({ ok: false, status: 422, text: () => Promise.resolve('unprocessable') }),
        )

      await expect(new OctokitGithubClient().convertManifest('x')).rejects.toThrow(/422/)
    })
  })

  describe('getInstallationToken', () => {
    it('mints an installation token via the auth strategy', async () => {
      const { factory, installationIds } = fakeFactory('ghs_minted')
      const client = new OctokitGithubClient(factory)

      const token = await client.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM',
        installationId: '777',
      })

      expect(token).toBe('ghs_minted')
      expect(installationIds()).toEqual(['777'])
    })

    it('reuses one auth instance per App so the library token cache survives', async () => {
      const { factory, factoryCalls } = fakeFactory('ghs_cached')
      const client = new OctokitGithubClient(factory)

      await client.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM',
        installationId: '1',
      })
      await client.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM',
        installationId: '2',
      })

      expect(factoryCalls()).toBe(1)
    })

    it('creates a separate auth instance per distinct App', async () => {
      const { factory, factoryCalls } = fakeFactory('ghs_x')
      const client = new OctokitGithubClient(factory)

      await client.getInstallationToken({
        githubAppId: '1',
        privateKeyPem: 'PEM',
        installationId: '1',
      })
      await client.getInstallationToken({
        githubAppId: '2',
        privateKeyPem: 'PEM',
        installationId: '1',
      })

      expect(factoryCalls()).toBe(2)
    })

    it('refreshes the cached auth when the App private key rotates', async () => {
      const { factory, factoryCalls } = fakeFactory('ghs_rot')
      const client = new OctokitGithubClient(factory)

      await client.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM-OLD',
        installationId: '1',
      })
      await client.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM-NEW',
        installationId: '1',
      })

      expect(factoryCalls()).toBe(2)
    })

    it('constructs with the real createAppAuth strategy by default', () => {
      expect(new OctokitGithubClient()).toBeInstanceOf(OctokitGithubClient)
    })

    it('wraps an upstream failure without leaking GitHub detail', async () => {
      const { factory } = fakeFactory(new Error('401 from GitHub: bad PEM'))
      const client = new OctokitGithubClient(factory)

      await expect(
        client.getInstallationToken({
          githubAppId: '42',
          privateKeyPem: 'PEM',
          installationId: '777',
        }),
      ).rejects.toThrow('Could not mint a GitHub installation access token.')
    })
  })
})
