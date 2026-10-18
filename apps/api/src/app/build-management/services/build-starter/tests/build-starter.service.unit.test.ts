import { before, describe, it } from 'node:test'
import { BadGatewayException, UnprocessableEntityException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { InstallationNotFoundError } from '#src/app/build-management/errors/installation-not-found.error.js'
import { BuildStarterRepository } from '#src/app/build-management/services/build-starter/build-starter.repository.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { BranchNotFoundError } from '#src/modules/github-client/github-client.errors.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { commitShaOf } from '#src/test/setup/test-constants.js'

const SHA = commitShaOf('d')
const source = new AppSourceBuilder().withRootDir('apps/api').build()
const app = new AppBuilder().withSlug('shop').withSource(source).build()
const tx = {} as Executor
const options = (trigger: BuildTrigger) => ({ trigger, commitSha: SHA, gitToken: 'ghs_token' })

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
  github.getBranchHead.resolves(SHA)
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

    const started = await starter.start(tx, app, options(BuildTrigger.Manual))

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
  })

  it('cancels the superseded Job before starting the new one', async () => {
    const { starter, runtime } = build()

    await starter.start(tx, app, options(BuildTrigger.Push))

    expect(runtime.cancel.getCall(0).calledBefore(runtime.start.getCall(0))).toBe(true)
  })

  it('records a runtime failure on the new build', async () => {
    const { starter, runtime } = build()
    runtime.start.rejects(new Error('cluster down'))

    const failed = await starter.start(tx, app, options(BuildTrigger.Push))

    expect(failed.failureReason).toBe('cluster down')
  })

  it('records a failed cancel of the superseded Job on the new build', async () => {
    const { starter, runtime } = build()
    runtime.cancel.rejects(new Error('cluster down'))

    const failed = await starter.start(tx, app, options(BuildTrigger.Push))

    expect(failed.failureReason).toBe('cluster down')
    expect(runtime.start.called).toBe(false)
  })

  it('resolves the branch head with a token minted from the stored credentials', async () => {
    const { starter, github } = build()

    const head = await starter.resolveHead(source)

    expect(head).toEqual({ commitSha: SHA, gitToken: 'ghs_token' })
    expect(
      github.getInstallationToken.calledOnceWith({
        githubAppId: '42',
        privateKeyPem: 'pem',
        installationId: '7',
      }),
    ).toBe(true)
    expect(
      github.getBranchHead.calledOnceWith({
        token: 'ghs_token',
        repo: 'acme/shop',
        branch: 'main',
      }),
    ).toBe(true)
  })

  it('422s when the installation is gone', async () => {
    const { starter, repository } = build()
    repository.findCredentials.resolves(undefined)

    await expect(starter.resolveHead(source)).rejects.toThrow(InstallationNotFoundError)
  })

  it('422s when the branch is not readable', async () => {
    const { starter, github } = build()
    github.getBranchHead.rejects(new BranchNotFoundError('no such branch'))

    await expect(starter.resolveHead(source)).rejects.toThrow(UnprocessableEntityException)
  })

  it('502s when GitHub fails', async () => {
    const { starter, github } = build()
    github.getInstallationToken.rejects(new Error('github down'))

    await expect(starter.resolveHead(source)).rejects.toThrow(BadGatewayException)
  })

  it('refuses an app without a source before touching anything', async () => {
    const { starter, repository } = build()

    await expect(
      starter.start(tx, new AppBuilder().build(), options(BuildTrigger.Manual)),
    ).rejects.toThrow("App 'my-app' has no source to build.")
    expect(repository.insert.called).toBe(false)
  })
})
