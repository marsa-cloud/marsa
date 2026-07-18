import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GetManifestResponse } from '~/api/types.gen'

import { submitManifestForm, useGithubProvisioning } from '../useGithubProvisioning'

const MANIFEST: GetManifestResponse = {
  manifest: {
    name: 'marsa-demo',
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

const convertResponse = {
  appSlug: 'marsa-demo',
  appName: 'Marsa Demo',
  htmlUrl: 'https://github.com/apps/marsa-demo',
  installUrl: 'https://github.com/apps/marsa-demo/installations/new',
}
const captureResponse = { installationId: '42', accountLogin: 'octocat', connected: true }

registerEndpoint('/api/v1/github-app/manifest', () => MANIFEST)
registerEndpoint('/api/v1/github-app/convert-manifest', { method: 'POST', handler: () => convertResponse })
registerEndpoint('/api/v1/github-app/capture-installation', { method: 'POST', handler: () => captureResponse })

describe('useGithubProvisioning clients', () => {
  it('fetchManifest reads the manifest endpoint', async () => {
    const { fetchManifest } = useGithubProvisioning()
    expect(await fetchManifest()).toEqual(MANIFEST)
  })

  it('convert POSTs the OAuth code/state and returns the created app', async () => {
    const { convert } = useGithubProvisioning()
    expect(await convert('the-code', 'abc')).toEqual(convertResponse)
  })

  it('captureInstallation POSTs the installation id and returns its connection state', async () => {
    const { captureInstallation } = useGithubProvisioning()
    expect(await captureInstallation('42', 'install')).toEqual(captureResponse)
  })
})

describe('submitManifestForm', () => {
  afterEach(() => vi.restoreAllMocks())

  it('appends the manifest form to the document and submits it', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    submitManifestForm(MANIFEST)

    const form = document.body.querySelector('form[action="https://github.com/settings/apps/new?state=abc"]')
    expect(form).toBeTruthy()
    expect(submit).toHaveBeenCalledOnce()
  })
})
