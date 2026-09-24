import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SHA = 'd'.repeat(40)
const source: AppSource = {
  type: 'github',
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  repo: 'acme/shop',
  branch: 'main',
  rootDir: 'apps/api',
  dockerfilePath: 'Dockerfile',
}
const app = new AppBuilder().withSlug('shop').withSource(source).build()
const tx = {} as Executor

function build() {
  const repository = createStubInstance(BuildStarterRepository)
  const previous = new BuildBuilder().withApp(app).build()
  repository.cancelRunning.resolves([previous])
  repository.insert.callsFake((_tx, row) =>
    Promise.resolve({ ...new BuildBuilder().build(), ...row }),
  )
  repository.fail.callsFake((_tx, uuid, failureReason) =>
    Promise.resolve({
      ...new BuildBuilder().build(),
      uuid,
      status: BuildStatus.Failed,
      failureReason,
    }),
  )
  repository.findCredentials.resolves({
    installationUuid: source.installationUuid,
    installationId: '7',
    githubAppId: '42',
    privateKeyPemEnc: 'enc',
  })
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns('pem')
  const github = createStubInstance(MockGithubClient)
  github.getInstallationToken.resolves('ghs_token')
  const runtime = createStubInstance(MockBuildRuntime)
  runtime.start.resolves()
  runtime.cancel.resolves()
  const starter = new BuildStarter(repository, cipher, github, runtime, new MockImageRegistry())
  return { starter, repository, github, runtime, previous }
}

describe('BuildStarter', () => {
  before(() => TestBench.setupUnitTest())

  it('cancels the running build, then starts the new one with a pinned commit', async () => {
    const { starter, repository, runtime, previous } = build()

    const started = await starter.start(tx, app, { trigger: BuildTrigger.Manual, commitSha: SHA })

    expect(repository.insert.firstCall.args[1]).toMatchObject({
      appUuid: app.uuid,
      commitSha: SHA,
      branch: 'main',
      status: BuildStatus.Running,
      trigger: BuildTrigger.Manual,
    })
    expect(runtime.cancel.calledOnceWith(match({ build: { uuid: previous.uuid } }))).toBe(true)
    const [ref, spec] = runtime.start.firstCall.args
    expect(ref).toEqual({ build: { uuid: started.uuid }, app: { slug: 'shop' } })
    expect(spec).toEqual({
      repoUrl: 'https://github.com/acme/shop.git',
      commitSha: SHA,
      rootDir: 'apps/api',
      dockerfilePath: 'Dockerfile',
      gitToken: 'ghs_token',
      pushRef: `registry.mock.test/shop:${SHA}`,
    })
    expect(runtime.cancel.getCall(0).calledBefore(runtime.start.getCall(0))).toBe(true)
  })

  it('records a token failure on the new build instead of throwing', async () => {
    const { starter, github, runtime } = build()
    github.getInstallationToken.rejects(
      new Error('Could not mint a GitHub installation access token.'),
    )

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.status).toBe(BuildStatus.Failed)
    expect(failed.failureReason).toBe('Could not mint a GitHub installation access token.')
    expect(runtime.start.called).toBe(false)
  })

  it('records a runtime failure on the new build', async () => {
    const { starter, runtime } = build()
    runtime.start.rejects(new Error('cluster down'))

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.failureReason).toBe('cluster down')
  })

  it('fails the build when the installation is gone', async () => {
    const { starter, repository } = build()
    repository.findCredentials.resolves(undefined)

    const failed = await starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha: SHA })

    expect(failed.failureReason).toBe('The GitHub App installation for acme/shop no longer exists.')
  })

  it('refuses an app without a source before touching anything', async () => {
    const { starter, repository } = build()

    await expect(
      starter.start(tx, new AppBuilder().build(), {
        trigger: BuildTrigger.Manual,
        commitSha: SHA,
      }),
    ).rejects.toThrow("App 'my-app' has no source to build.")
    expect(repository.insert.called).toBe(false)
  })
})
