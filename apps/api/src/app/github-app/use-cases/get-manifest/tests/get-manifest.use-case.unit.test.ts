import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import type { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds a manifest from config plus a freshly issued state', async () => {
    const config: GitHubAppConfig = {
      webUrl: 'https://demo.marsa.cc',
      apiPublicUrl: 'https://api.demo.marsa.cc',
      webhookUrl: 'https://api.demo.marsa.cc/api/v1/github-app/webhooks',
      redirectUrl: 'https://demo.marsa.cc/setup/github/callback',
      oauthCallbackUrl: 'https://demo.marsa.cc/auth/github/callback',
    }
    const manifestState = createStubInstance(ManifestStateService)
    manifestState.issue.resolves('issued-state-token')

    const usecase = new GetManifestUseCase(config, manifestState)

    const result = await usecase.execute()
    const manifest = result.manifest

    expect(manifest.url).toBe(config.webUrl)
    expect(manifest.hook_attributes.url).toBe(config.webhookUrl)
    expect(manifest.redirect_url).toBe(config.redirectUrl)
    expect(manifest.callback_urls).toEqual([config.oauthCallbackUrl])
    expect(manifest.public).toBe(false)
    expect(manifest.request_oauth_on_install).toBe(true)
    expect(manifest.default_events).toEqual(['push'])
    expect(manifestState.issue.calledOnce).toBe(true)
    expect(result.state).toBe('issued-state-token')
    expect(result.formAction).toContain(`state=${encodeURIComponent('issued-state-token')}`)
  })
})
