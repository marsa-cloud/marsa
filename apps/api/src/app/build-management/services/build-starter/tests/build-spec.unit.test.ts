import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { buildSpecOf } from '#src/app/build-management/services/build-starter/build-spec.js'

describe('buildSpecOf', () => {
  it('builds the pinned commit of the GitHub repo from the source directory', () => {
    const source = new AppSourceBuilder()
      .withRootDir('apps/web')
      .withDockerfilePath('Dockerfile.prod')
      .build()

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
