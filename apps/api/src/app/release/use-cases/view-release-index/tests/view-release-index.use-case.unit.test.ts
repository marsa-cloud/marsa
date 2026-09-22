import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ViewReleaseIndexQueryBuilder } from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.builder.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { RolloutStatus } from '#src/modules/runtime/runtime.types.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

const SLUG = 'my-app'

// No cursor — the first page, where refresh-on-read is allowed to run.
const firstPage = () => new ViewReleaseIndexQueryBuilder().withoutPagination().build()

const pageAfter = (release: Release) =>
  new ViewReleaseIndexQueryBuilder().withCursorAt(release).build()

function release(deployStatus: DeployStatus) {
  const app = new AppBuilder().withSlug(SLUG).build()
  return new ReleaseBuilder().withApp(app).withDeployStatus(deployStatus).build()
}

function build(releases = [release(DeployStatus.Pending)]) {
  const repository = createStubInstance(ViewReleaseIndexRepository)
  repository.findByAppSlug.resolves(releases)
  repository.setReleaseDeployStatus.resolves()
  repository.findPlacement.resolves(
    new AppPlacementBuilder().withApp(new AppBuilder().withSlug(SLUG).build()).build(),
  )

  const appRuntime = createStubInstance(MockAppRuntime)
  appRuntime.readLiveReleaseUuid.resolves(releases[0]?.uuid ?? null)

  const usecase = new ViewReleaseIndexUseCase(repository, appRuntime)
  return { usecase, repository, appRuntime, releases }
}

describe('ViewReleaseIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists Succeeded and reflects it when the rollout is Complete', async () => {
    const { usecase, repository, appRuntime, releases } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    const [uuid, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
    expect(status).toBe(DeployStatus.Succeeded)
    expect(result.items[0].deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('persists Failed when the rollout has Failed', async () => {
    const { usecase, repository, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Failed)
    appRuntime.readDeployFailure.resolves(null)

    await usecase.execute(SLUG, firstPage())

    const [, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(status).toBe(DeployStatus.Failed)
  })

  it('attaches the live failure reason to the head release when the deploy has failed', async () => {
    const { usecase, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Failed)
    appRuntime.readDeployFailure.resolves({
      reason: 'ImagePullBackOff',
      message: 'Back-off pulling image "nginx:doesnotexist"',
    })

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.items[0].failureReason).toBe('ImagePullBackOff')
    expect(result.items[0].failureMessage).toBe('Back-off pulling image "nginx:doesnotexist"')
  })

  it('does not read a failure reason when the rollout has not failed', async () => {
    const { usecase, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    expect(appRuntime.readDeployFailure.called).toBe(false)
    expect(result.items[0].failureReason).toBeUndefined()
  })

  it('advances Pending to InProgress while the rollout is Progressing', async () => {
    const { usecase, repository, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG, firstPage())

    const [, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(status).toBe(DeployStatus.InProgress)
  })

  it('does not write when the observed status equals the stored one (write-on-change)', async () => {
    const { usecase, repository, appRuntime } = build([release(DeployStatus.InProgress)])
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG, firstPage())

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('never persists on NotFound (absence of observation is not a state)', async () => {
    const { usecase, repository, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.NotFound)

    await usecase.execute(SLUG, firstPage())

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('skips the cluster read entirely when the only release is already terminal', async () => {
    const { usecase, appRuntime } = build([release(DeployStatus.Succeeded)])

    await usecase.execute(SLUG, firstPage())

    expect(appRuntime.readRolloutStatus.called).toBe(false)
  })

  it('reconciles only the latest non-terminal release', async () => {
    const releases = [release(DeployStatus.Pending), release(DeployStatus.Pending)]
    const { usecase, repository, appRuntime } = build(releases)
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    await usecase.execute(SLUG, firstPage())

    expect(appRuntime.readRolloutStatus.calledOnce).toBe(true)
    expect(repository.setReleaseDeployStatus.calledOnce).toBe(true)
    const [uuid] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
  })

  it('does not reconcile on a later page, where releases[0] is not the head', async () => {
    // Page two's first row is an older release. Reconciling it would stamp the
    // current rollout's outcome onto a superseded release — the #98-class false
    // negative the first-page guard exists to prevent.
    const releases = [release(DeployStatus.Pending), release(DeployStatus.Pending)]
    const { usecase, repository, appRuntime } = build(releases)
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, pageAfter(releases[0]))

    expect(appRuntime.readRolloutStatus.called).toBe(false)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
    expect(appRuntime.readDeployFailure.called).toBe(false)
    expect(result.items[0].deployStatus).toBe(DeployStatus.Pending)
  })

  it('leaves an older non-terminal release untouched when the newest is terminal', async () => {
    // A superseded Pending release (older) must not be stamped with the current
    // Deployment's outcome — only the head (Succeeded, terminal) maps to it.
    const releases = [release(DeployStatus.Succeeded), release(DeployStatus.Pending)]
    const { usecase, repository, appRuntime } = build(releases)

    await usecase.execute(SLUG, firstPage())

    expect(appRuntime.readRolloutStatus.called).toBe(false)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
    expect(releases[1].deployStatus).toBe(DeployStatus.Pending)
  })
  it('leaves an undeployed head pending while another release is live', async () => {
    const { usecase, repository, appRuntime } = build()
    appRuntime.readLiveReleaseUuid.resolves(generateUuid<ReleaseUuid>())
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.items[0].deployStatus).toBe(DeployStatus.Pending)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('reconciles when the live pods belong to the head', async () => {
    const { usecase, repository, appRuntime, releases } = build()
    appRuntime.readLiveReleaseUuid.resolves(releases[0].uuid)
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    await usecase.execute(SLUG, firstPage())

    expect(
      repository.setReleaseDeployStatus.calledOnceWith(releases[0].uuid, DeployStatus.Succeeded),
    ).toBe(true)
  })

  it('exposes the rollback source on each summary', async () => {
    const rollback = new ReleaseBuilder()
      .withSourceReleaseUuid(release(DeployStatus.Succeeded).uuid)
      .withDeployStatus(DeployStatus.Succeeded)
      .build()
    const { usecase } = build([rollback])

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.items[0].sourceReleaseUuid).toBe(rollback.sourceReleaseUuid)
  })
  it('does not reconcile when the live pods carry no release uuid at all', async () => {
    const { usecase, repository, appRuntime } = build()
    appRuntime.readLiveReleaseUuid.resolves(null)
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.items[0].deployStatus).toBe(DeployStatus.Pending)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('reconciles against the app namespace', async () => {
    const { usecase, appRuntime } = build()
    appRuntime.readRolloutStatus.resolves(RolloutStatus.Complete)

    await usecase.execute(SLUG, firstPage())

    expect(appRuntime.readLiveReleaseUuid.firstCall.args[0]).toMatchObject({
      environment: { projectSlug: 'my-project', environmentSlug: 'production' },
    })
    expect(appRuntime.readRolloutStatus.firstCall.args[0]).toMatchObject({
      environment: { projectSlug: 'my-project', environmentSlug: 'production' },
    })
  })
})
