import { before, describe, it } from 'node:test'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { sign } from '@octokit/webhooks-methods'
import { expect } from 'expect'
import { createStubInstance, match } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppSourceBuilder } from '#src/app/app-management/entities/app-source.builder.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { ReceivePushRepository } from '#src/app/build-management/use-cases/receive-push/receive-push.repository.js'
import { ReceivePushUseCase } from '#src/app/build-management/use-cases/receive-push/receive-push.use-case.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { stubDatabase } from '#src/test/setup/stub-database.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { commitShaOf, TEST_WEBHOOK_SECRET } from '#src/test/setup/test-constants.js'

const SHA = commitShaOf('b')

const source = new AppSourceBuilder().build()
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
  return { event, signature: await sign(TEST_WEBHOOK_SECRET, body), rawBody: Buffer.from(body) }
}

function build(apps = [shop]) {
  const repository = createStubInstance(ReceivePushRepository)
  repository.findSecretByInstallation.resolves('enc-secret')
  repository.findNewestSecret.resolves(undefined)
  repository.findAppsToBuild.resolves(apps)
  for (const app of apps) {
    repository.lockApp.withArgs(match.any, app.uuid).resolves(app)
  }
  repository.isNewestBuildLive.resolves(false)
  const starter = createStubInstance(BuildStarter)
  starter.resolveHead.resolves({ commitSha: SHA, gitToken: 'ghs_t' })
  starter.start.callsFake((_tx, app, { commitSha, trigger }) =>
    Promise.resolve(
      new BuildBuilder().withApp(app).withCommitSha(commitSha).withTrigger(trigger).build(),
    ),
  )
  const cipher = createStubInstance(SecretCipherService)
  cipher.decrypt.returns(TEST_WEBHOOK_SECRET)
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
      starter.start.calledWith(match.any, shop, {
        trigger: BuildTrigger.Push,
        commitSha: SHA,
        gitToken: 'ghs_t',
      }),
    ).toBe(true)
    expect(response.builds.map((b) => b.appSlug)).toEqual(['shop', 'shop-api'])
  })

  it('skips an app whose branch changed while its token was minted', async () => {
    const { usecase, starter, repository } = build()
    repository.lockApp
      .withArgs(match.any, shop.uuid)
      .resolves({ ...shop, source: { ...source, branch: 'release' } })

    await usecase.execute(await delivery())

    expect(starter.start.called).toBe(false)
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

  it('skips a redelivered push whose commit is already building or built', async () => {
    const { usecase, repository, starter } = build()
    repository.isNewestBuildLive.withArgs(match.any, shop.uuid, SHA).resolves(true)

    const response = await usecase.execute(await delivery())

    expect(starter.start.called).toBe(false)
    expect(response.builds).toEqual([])
  })

  it('skips a late push for a commit the branch has moved past', async () => {
    const { usecase, starter } = build([shop, shopApi])
    starter.resolveHead.resolves({ commitSha: commitShaOf('c'), gitToken: 'ghs_t' })

    const response = await usecase.execute(await delivery())

    expect(starter.start.called).toBe(false)
    expect(response.builds).toEqual([])
  })

  it('resolves the branch head once for every matching app', async () => {
    const { usecase, starter } = build([shop, shopApi])

    await usecase.execute(await delivery())

    expect(starter.resolveHead.calledOnceWith(source)).toBe(true)
    expect(starter.start.calledTwice).toBe(true)
  })

  it('does not reach GitHub when no app tracks the pushed branch', async () => {
    const { usecase, starter } = build([])

    const response = await usecase.execute(await delivery())

    expect(starter.resolveHead.called).toBe(false)
    expect(response.builds).toEqual([])
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
