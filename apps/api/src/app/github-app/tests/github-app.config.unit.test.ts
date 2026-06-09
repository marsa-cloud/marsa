import { before, describe, it } from 'node:test'

import { expect } from 'expect'

import { githubAppConfig } from '#src/app/github-app/github-app.config.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('githubAppConfig', () => {
  before(() => TestBench.setupUnitTest())

  it('derives webhook, redirect and oauth-callback URLs from validated env', () => {
    const config = githubAppConfig()

    expect(config.webUrl).toBe('https://demo.marsa.cc')
    expect(config.apiPublicUrl).toBe('https://api.demo.marsa.cc')
    expect(config.webhookUrl).toBe('https://api.demo.marsa.cc/api/v1/github-app/webhooks')
    expect(config.redirectUrl).toBe('https://demo.marsa.cc/setup/github/callback')
    expect(config.oauthCallbackUrl).toBe('https://demo.marsa.cc/auth/github/callback')
  })

  it('fails fast when a required URL env var is missing', () => {
    const original = process.env.MARSA_WEB_URL
    delete process.env.MARSA_WEB_URL
    try {
      expect(() => githubAppConfig()).toThrow(/MARSA_WEB_URL/)
    } finally {
      process.env.MARSA_WEB_URL = original
    }
  })
})
