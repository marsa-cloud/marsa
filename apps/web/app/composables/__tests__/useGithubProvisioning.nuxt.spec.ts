import { describe, expect, it } from 'vitest'

import type { GetManifestResponse } from '~/api/types.gen'

import { buildManifestForm } from '../useGithubProvisioning'

const MANIFEST: GetManifestResponse = {
  manifest: { url: 'https://demo.marsa.cc', public: false },
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
