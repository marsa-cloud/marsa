import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import type { AppAuthFactory } from '#src/modules/github-client/github-installation-token.service.js'
import { GitHubInstallationTokenService } from '#src/modules/github-client/github-installation-token.service.js'
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

describe('GitHubInstallationTokenService', () => {
  before(() => TestBench.setupUnitTest())

  it('mints an installation token via the auth strategy', async () => {
    const { factory, installationIds } = fakeFactory('ghs_minted')
    const service = new GitHubInstallationTokenService(factory)

    const token = await service.getInstallationToken({
      githubAppId: '42',
      privateKeyPem: 'PEM',
      installationId: '777',
    })

    expect(token).toBe('ghs_minted')
    expect(installationIds()).toEqual(['777'])
  })

  it('reuses one auth instance per App so the library token cache survives', async () => {
    const { factory, factoryCalls } = fakeFactory('ghs_cached')
    const service = new GitHubInstallationTokenService(factory)

    await service.getInstallationToken({
      githubAppId: '42',
      privateKeyPem: 'PEM',
      installationId: '1',
    })
    await service.getInstallationToken({
      githubAppId: '42',
      privateKeyPem: 'PEM',
      installationId: '2',
    })

    expect(factoryCalls()).toBe(1)
  })

  it('creates a separate auth instance per distinct App', async () => {
    const { factory, factoryCalls } = fakeFactory('ghs_x')
    const service = new GitHubInstallationTokenService(factory)

    await service.getInstallationToken({
      githubAppId: '1',
      privateKeyPem: 'PEM',
      installationId: '1',
    })
    await service.getInstallationToken({
      githubAppId: '2',
      privateKeyPem: 'PEM',
      installationId: '1',
    })

    expect(factoryCalls()).toBe(2)
  })

  it('constructs with the real createAppAuth strategy by default', () => {
    expect(new GitHubInstallationTokenService()).toBeInstanceOf(GitHubInstallationTokenService)
  })

  it('wraps an upstream failure without leaking GitHub detail', async () => {
    const { factory } = fakeFactory(new Error('401 from GitHub: bad PEM'))
    const service = new GitHubInstallationTokenService(factory)

    await expect(
      service.getInstallationToken({
        githubAppId: '42',
        privateKeyPem: 'PEM',
        installationId: '777',
      }),
    ).rejects.toThrow('Could not mint a GitHub installation access token.')
  })
})
