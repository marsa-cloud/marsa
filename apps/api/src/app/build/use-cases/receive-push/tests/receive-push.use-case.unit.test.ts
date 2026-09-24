import { before, describe, it } from 'node:test'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { sign } from '@octokit/webhooks-methods'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SECRET = 'whsec'
const SHA = 'b'.repeat(40)

const source = {
  type: 'github' as const,
  installationUuid: generateUuid<GitHubInstallationUuid>(),
  repo: 'acme/shop',
  branch: 'main',
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
}
const shop = new AppBuilder().withSlug('shop').withSource(source).build()
const shopApi = new AppBuilder().withSlug('shop-api').withSource(source).build()

const pushBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    ref: 'refs/heads/main',
    after: SHA,
    deleted: false,
    repository: { full_name: 'acme/shop' },
    installation: { id: 4242 },
    ...overrides,
  })

async function delivery(body = pushBody(), event = 'push') {
  return { event, signature: await sign(SECRET, body), rawBody: Buffer.from(body) }
}

function build(apps = [shop]) {
  const repository = createStubInstance(ReceivePushRepository)
  repository.findSecretByInstallation.resolves('enc-secret')
  repository.findNewestSecret.resolves(undefined)
  repository.findAppsToBuild.resolves(apps)
  for (const app of apps) {
    repository.lockApp.withArgs(match.any, app.uuid).resolves(app)
  }
  repository.findNewestBuild.resolves(undefined)
  const starter = createStubInstance(BuildStarter)
  starter.start.callsFake((_tx, app, { commitSha, trigger }) =>
    Promise.resolve(
      new BuildBuilder().withApp(app).withCommitSha(commitSha).withTrigger(trigger).build(),
    ),
  )
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns(SECRET)
  const usecase = new ReceivePushUseCase(stubDatabase(), repository, starter, cipher)
  return { usecase, repository, starter }
}

describe('ReceivePushUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('starts a push build of the pushed commit for every matching app', async () => {
    const { usecase, starter, repository } = build([shop, shopApi])

    const response = await usecase.execute(await delivery())

    expect(
      repository.findAppsToBuild.calledOnceWith({
        installationId: '4242',
        repo: 'acme/shop',
        branch: 'main',
        commitSha: SHA,
      }),
    ).toBe(true)
    expect(
      starter.start.calledWith(match.any, shop, { trigger: BuildTrigger.Push, commitSha: SHA }),
    ).toBe(true)
    expect(response.builds.map((b) => b.appSlug)).toEqual(['shop', 'shop-api'])
  })

  it('401s a delivery without a signature', async () => {
    const { usecase } = build()

    await expect(
      usecase.execute({ event: 'push', rawBody: Buffer.from(pushBody()) }),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('401s a signature made with another secret', async () => {
    const { usecase, starter } = build()
    const body = pushBody()

    await expect(
      usecase.execute({
        event: 'push',
        signature: await sign('not-the-secret', body),
        rawBody: Buffer.from(body),
      }),
    ).rejects.toThrow(UnauthorizedException)
    expect(starter.start.called).toBe(false)
  })

  it('401s when Marsa holds no webhook secret at all', async () => {
    const { usecase, repository } = build()
    repository.findSecretByInstallation.resolves(undefined)

    await expect(usecase.execute(await delivery())).rejects.toThrow(UnauthorizedException)
  })

  it('verifies a delivery without an installation against the newest App', async () => {
    const { usecase, repository } = build()
    repository.findNewestSecret.resolves('enc-secret')

    const response = await usecase.execute(await delivery(JSON.stringify({ zen: 'hi' }), 'ping'))

    expect(repository.findSecretByInstallation.called).toBe(false)
    expect(response.builds).toEqual([])
  })

  it('400s a body that is not JSON', async () => {
    const { usecase } = build()

    await expect(usecase.execute(await delivery('not json'))).rejects.toThrow(BadRequestException)
  })

  it('ignores events other than push', async () => {
    const { usecase, starter } = build()

    const response = await usecase.execute(await delivery(pushBody(), 'installation'))

    expect(response.builds).toEqual([])
    expect(starter.start.called).toBe(false)
  })

  it('ignores a tag push', async () => {
    const { usecase, starter } = build()

    await usecase.execute(await delivery(pushBody({ ref: 'refs/tags/v1' })))

    expect(starter.start.called).toBe(false)
  })

  for (const status of [BuildStatus.Running, BuildStatus.Succeeded]) {
    it(`skips a redelivered push whose commit is the newest build and ${status}`, async () => {
      const { usecase, repository, starter } = build()
      repository.findNewestBuild.resolves(
        new BuildBuilder().withApp(shop).withCommitSha(SHA).withStatus(status).build(),
      )

      const response = await usecase.execute(await delivery())

      expect(starter.start.called).toBe(false)
      expect(response.builds).toEqual([])
    })
  }

  it('builds the commit again when its newest build failed', async () => {
    const { usecase, repository, starter } = build()
    repository.findNewestBuild.resolves(
      new BuildBuilder().withApp(shop).withCommitSha(SHA).withStatus(BuildStatus.Failed).build(),
    )

    await usecase.execute(await delivery())

    expect(starter.start.calledOnce).toBe(true)
  })

  it('builds a commit the app built before if a newer one came in between', async () => {
    const { usecase, repository, starter } = build()
    repository.findNewestBuild.resolves(
      new BuildBuilder().withApp(shop).withCommitSha('c'.repeat(40)).build(),
    )

    await usecase.execute(await delivery())

    expect(starter.start.calledOnce).toBe(true)
  })

  it('keeps going when one app fails to start', async () => {
    const { usecase, starter } = build([shop, shopApi])
    starter.start.onFirstCall().rejects(new Error('boom'))

    const response = await usecase.execute(await delivery())

    expect(response.builds.map((b) => b.appSlug)).toEqual(['shop-api'])
  })

  it('skips an app deleted between matching and locking', async () => {
    const { usecase, repository, starter } = build()
    repository.lockApp.withArgs(match.any, shop.uuid).resolves(undefined)

    const response = await usecase.execute(await delivery())

    expect(starter.start.called).toBe(false)
    expect(response.builds).toEqual([])
  })
})
