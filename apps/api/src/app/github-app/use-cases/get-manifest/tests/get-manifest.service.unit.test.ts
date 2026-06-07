import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { GetManifestService } from '#src/app/github-app/use-cases/get-manifest/get-manifest.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetManifestService', () => {
  before(() => TestBench.setupUnitTest())

  it('builds a manifest from config plus a verifiable state', () => {
    const config = new GitHubAppConfig()
    const signer = new StateSigner()
    const service = new GetManifestService(config, signer)

    const result = service.execute()
    const manifest = result.manifest

    expect(manifest.url).toBe(config.webUrl)
    expect((manifest.hook_attributes as { url: string }).url).toBe(config.webhookUrl)
    expect(manifest.redirect_url).toBe(config.redirectUrl)
    expect(manifest.callback_urls).toEqual([config.oauthCallbackUrl])
    expect(manifest.public).toBe(false)
    expect(manifest.request_oauth_on_install).toBe(true)
    expect(manifest.default_events).toEqual(['push'])
    expect(result.formAction).toContain('https://github.com/settings/apps/new?state=')
    expect(signer.verify(result.state)).toBe(true)
  })
})
