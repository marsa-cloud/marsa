import { describe, it } from 'node:test'
import { expect } from 'expect'
import { buildSpecOf } from '#src/app/build/entities/build-spec.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('buildSpecOf', () => {
  it('builds the pinned commit of the GitHub repo from the source directory', () => {
    const source = {
      type: 'github' as const,
      installationUuid: generateUuid<GitHubInstallationUuid>(),
      repo: 'acme/shop',
      branch: 'main',
      rootDir: 'apps/web',
      dockerfilePath: 'Dockerfile.prod',
    }

    expect(buildSpecOf(source, 'a'.repeat(40), 'ghs_t', 'registry:5000/shop:aaa')).toEqual({
      repoUrl: 'https://github.com/acme/shop.git',
      commitSha: 'a'.repeat(40),
      rootDir: 'apps/web',
      dockerfilePath: 'Dockerfile.prod',
      gitToken: 'ghs_t',
      pushRef: 'registry:5000/shop:aaa',
    })
  })
})
