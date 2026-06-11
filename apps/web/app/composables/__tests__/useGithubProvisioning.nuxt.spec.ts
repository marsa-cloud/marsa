import { describe, expect, it } from 'vitest'

import type { GetManifestResponse } from '~/api/types.gen'

import { buildManifestForm } from '../useGithubProvisioning'

const MANIFEST: GetManifestResponse = {
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
  formAction: 'https://github.com/settings/apps/new?state=abc',
  state: 'abc',
}

describe('buildManifestForm', () => {
  it('builds a POST form carrying the manifest JSON', () => {
    const form = buildManifestForm(MANIFEST)

    expect(form.method.toLowerCase()).toBe('post')
    expect(form.action).toContain('github.com/settings/apps/new')
    const input = form.querySelector('input[name="manifest"]') as HTMLInputElement
    expect(JSON.parse(input.value)).toEqual(MANIFEST.manifest)
  })
})
