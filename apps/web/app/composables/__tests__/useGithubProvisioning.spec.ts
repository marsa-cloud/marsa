import { describe, expect, it } from 'vitest'

import { zConvertManifestResponse, zGetManifestResponse } from '~/api/zod.gen'

// Boundary contract checks (mirrors useApiStatus.spec): validate the generated
// Zod schemas the composable parses responses against, without booting Nuxt.
describe('github provisioning contracts', () => {
  it('accepts a valid manifest response', () => {
    const valid = {
      manifest: { url: 'https://demo.marsa.cc' },
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
})
