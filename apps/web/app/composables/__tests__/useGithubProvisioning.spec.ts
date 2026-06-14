import { describe, expect, it } from 'vitest'

import {
  zCaptureInstallationResponse,
  zConvertManifestResponse,
  zGetManifestResponse,
} from '~/api/zod.gen'

// Boundary contract checks (mirrors useApiStatus.spec): validate the generated
// Zod schemas the composable parses responses against, without booting Nuxt.
describe('github provisioning contracts', () => {
  it('accepts a valid manifest response', () => {
    const valid = {
      manifest: {
        name: 'marsa-demo-marsa-cc',
        url: 'https://demo.marsa.cc',
        hook_attributes: { url: 'https://api.demo.marsa.cc/api/v1/github-app/webhooks' },
        redirect_url: 'https://demo.marsa.cc/setup/github/callback',
        callback_urls: ['https://demo.marsa.cc/auth/github/callback'],
        public: false,
        request_oauth_on_install: true,
        default_permissions: { contents: 'read', metadata: 'read' },
        default_events: ['push'],
      },
      formAction: 'https://github.com/settings/apps/new?state=s',
      state: 's',
    }

    expect(zGetManifestResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a manifest response missing formAction', () => {
    expect(() => zGetManifestResponse.parse({ manifest: {}, state: 's' })).toThrow()
  })

  it('accepts a valid conversion response', () => {
    const valid = {
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    }

    expect(zConvertManifestResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a conversion response with a non-string appName', () => {
    expect(() =>
      zConvertManifestResponse.parse({ appSlug: 'x', appName: 5, htmlUrl: 'u', installUrl: 'i' }),
    ).toThrow()
  })

  it('accepts a valid capture-installation response (null accountLogin allowed)', () => {
    const valid = { installationId: '88776655', accountLogin: null, connected: true }

    expect(zCaptureInstallationResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a capture-installation response missing installationId', () => {
    expect(() => zCaptureInstallationResponse.parse({ accountLogin: null, connected: true })).toThrow()
  })
})
