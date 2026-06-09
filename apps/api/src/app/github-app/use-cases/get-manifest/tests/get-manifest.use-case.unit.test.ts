import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import type { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds a manifest from config plus a signed state', () => {
    const config: GitHubAppConfig = {
      webUrl: 'https://demo.marsa.cc',
      apiPublicUrl: 'https://api.demo.marsa.cc',
      webhookUrl: 'https://api.demo.marsa.cc/api/v1/github-app/webhooks',
      redirectUrl: 'https://demo.marsa.cc/setup/github/callback',
      oauthCallbackUrl: 'https://demo.marsa.cc/auth/github/callback',
    }
    const signer = createStubInstance(StateSigner)
    signer.sign.returns('signed-state-token')

    const usecase = new GetManifestUseCase(config, signer)

    const result = usecase.execute()
    const manifest = result.manifest

    expect(manifest.url).toBe(config.webUrl)
    expect(manifest.hook_attributes.url).toBe(config.webhookUrl)
    expect(manifest.redirect_url).toBe(config.redirectUrl)
    expect(manifest.callback_urls).toEqual([config.oauthCallbackUrl])
    expect(manifest.public).toBe(false)
    expect(manifest.request_oauth_on_install).toBe(true)
    expect(manifest.default_events).toEqual(['push'])
    expect(signer.sign.calledOnce).toBe(true)
    expect(result.state).toBe('signed-state-token')
    expect(result.formAction).toContain(`state=${encodeURIComponent('signed-state-token')}`)
  })
})
