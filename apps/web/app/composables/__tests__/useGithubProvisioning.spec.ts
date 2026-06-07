// @vitest-environment nuxt
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import type { GetManifestResponse } from '~/api/types.gen'

import { buildManifestForm, useGithubProvisioning } from '../useGithubProvisioning'

const apiMock = vi.hoisted(() => vi.fn())
mockNuxtImport('useNuxtApp', () => () => ({ $api: apiMock }))

const MANIFEST: GetManifestResponse = {
  manifest: { url: 'https://demo.marsa.cc', public: false },
  formAction: 'https://github.com/settings/apps/new?state=abc',
  state: 'abc',
}

describe('useGithubProvisioning', () => {
  it('fetchManifest validates and returns the manifest', async () => {
    apiMock.mockResolvedValueOnce(MANIFEST)

    const { fetchManifest } = useGithubProvisioning()
    const result = await fetchManifest()

    expect(result.formAction).toContain('github.com/settings/apps/new')
    expect(apiMock).toHaveBeenCalledWith('/v1/github-app/manifest')
  })

  it('convert posts code+state and validates the response', async () => {
    apiMock.mockResolvedValueOnce({
      appSlug: 'marsa-x',
      appName: 'marsa.x',
      htmlUrl: 'https://github.com/apps/marsa-x',
      installUrl: 'https://github.com/apps/marsa-x/installations/new',
    })

    const { convert } = useGithubProvisioning()
    const result = await convert('code1', 'state1')

    expect(result.appName).toBe('marsa.x')
    expect(apiMock).toHaveBeenCalledWith('/v1/github-app/conversions', {
      method: 'POST',
      body: { code: 'code1', state: 'state1' },
    })
  })

  it('convert rejects a response that violates the contract', async () => {
    apiMock.mockResolvedValueOnce({ appSlug: 'marsa-x' })

    const { convert } = useGithubProvisioning()

    await expect(convert('c', 's')).rejects.toThrow()
  })

  it('buildManifestForm builds a POST form carrying the manifest JSON', () => {
    const form = buildManifestForm(MANIFEST)

    expect(form.method.toLowerCase()).toBe('post')
    expect(form.action).toContain('github.com/settings/apps/new')
    const input = form.querySelector('input[name="manifest"]') as HTMLInputElement
    expect(JSON.parse(input.value)).toEqual(MANIFEST.manifest)
  })
})
