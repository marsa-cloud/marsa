import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GitHubAppConfig', () => {
  before(() => TestBench.setupUnitTest())

  it('derives webhook, redirect and oauth-callback URLs from env', () => {
    const config = new GitHubAppConfig()

    expect(config.webUrl).toBe('https://demo.marsa.cc')
    expect(config.apiPublicUrl).toBe('https://api.demo.marsa.cc')
    expect(config.webhookUrl).toBe('https://api.demo.marsa.cc/api/v1/github-app/webhooks')
    expect(config.redirectUrl).toBe('https://demo.marsa.cc/setup/github/callback')
    expect(config.oauthCallbackUrl).toBe('https://demo.marsa.cc/auth/github/callback')
  })
})
