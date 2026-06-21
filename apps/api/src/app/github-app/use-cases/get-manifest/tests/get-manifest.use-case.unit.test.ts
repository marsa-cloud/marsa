import { before, describe, it } from 'node:test'

import { expect } from 'expect'
import { createStubInstance, stub } from 'sinon'

import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const WEB_URL = 'https://demo.marsa.cc'
const API_PUBLIC_URL = 'https://api.demo.marsa.cc'

describe('GetManifestUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('builds a manifest from config plus a freshly issued state', async () => {
    const manifestState = createStubInstance(ManifestStateService)
    const stateUuid = generateUuid<ManifestStateUuid>()
    manifestState.issue.resolves(stateUuid)

    const configService = { getOrThrow: stub() }
    configService.getOrThrow.withArgs('MARSA_WEB_URL').returns(WEB_URL)
    configService.getOrThrow.withArgs('MARSA_API_PUBLIC_URL').returns(API_PUBLIC_URL)

    const usecase = new GetManifestUseCase(manifestState, configService as never)

    const result = await usecase.execute()
    const manifest = result.manifest

    expect(manifest.url).toBe(WEB_URL)
    expect(manifest.hook_attributes.url).toBe(`${API_PUBLIC_URL}/api/v1/github-app/webhooks`)
    expect(manifest.redirect_url).toBe(`${WEB_URL}/setup/github/callback`)
    expect(manifest.callback_urls).toEqual([`${WEB_URL}/auth/github/callback`])
    expect(manifest.public).toBe(false)
    expect(manifest.request_oauth_on_install).toBe(true)
    expect(manifest.default_events).toEqual(['push'])
    expect(manifestState.issue.calledOnce).toBe(true)
    expect(result.state).toBe(stateUuid)
    expect(result.formAction).toContain(`state=${encodeURIComponent(stateUuid)}`)
  })
})
