import type { ConvertManifestResponse, GetManifestResponse } from '~/api/types.gen'
import { zConvertManifestResponse, zGetManifestResponse } from '~/api/zod.gen'

/**
 * Client for the GitHub App provisioning endpoints (#58). Responses are
 * validated against the generated Zod schemas at the boundary, matching the
 * web↔api contract convention.
 */
export function useGithubProvisioning() {
  const { $api } = useNuxtApp()

  async function fetchManifest(): Promise<GetManifestResponse> {
    const raw = await $api('/v1/github-app/manifest')
    return zGetManifestResponse.parse(raw)
  }

  async function convert(code: string, state: string): Promise<ConvertManifestResponse> {
    const raw = await $api('/v1/github-app/convert-manifest', {
      method: 'POST',
      body: { code, state },
    })
    return zConvertManifestResponse.parse(raw)
  }

  return { fetchManifest, convert }
}

/**
 * Build the hidden form that POSTs the manifest to GitHub. The Manifest flow
 * requires a form POST (not a redirect), so we construct one in the browser.
 * Split from submission so the construction is unit-testable.
 */
export function buildManifestForm(data: GetManifestResponse, doc: Document = document): HTMLFormElement {
  const form = doc.createElement('form')
  form.method = 'POST'
  form.action = data.formAction

  const input = doc.createElement('input')
  input.type = 'hidden'
  input.name = 'manifest'
  input.value = JSON.stringify(data.manifest)
  form.appendChild(input)

  return form
}

/** Append the manifest form to the document and submit it (navigates to GitHub). */
export function submitManifestForm(data: GetManifestResponse, doc: Document = document): void {
  const form = buildManifestForm(data, doc)
  doc.body.appendChild(form)
  form.submit()
}
