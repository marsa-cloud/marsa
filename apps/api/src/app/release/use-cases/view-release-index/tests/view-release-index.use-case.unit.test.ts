import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import {
  ViewReleaseIndexPaginationQuery,
  ViewReleaseIndexQuery,
  ViewReleaseIndexQueryKey,
} from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const SLUG = 'my-app'

/** No cursor — the first page, where refresh-on-read is allowed to run. */
function firstPage(): ViewReleaseIndexQuery {
  return new ViewReleaseIndexQuery()
}

function pageAfter(key: ViewReleaseIndexQueryKey): ViewReleaseIndexQuery {
  const query = new ViewReleaseIndexQuery()
  query.pagination = new ViewReleaseIndexPaginationQuery()
  query.pagination.key = key
  return query
}

function release(deployStatus: DeployStatus) {
  const app = new AppBuilder().withSlug(SLUG).build()
  return new ReleaseBuilder().withApp(app).withDeployStatus(deployStatus).build()
}

function build(releases = [release(DeployStatus.Pending)]) {
  const repository = createStubInstance(ViewReleaseIndexRepository)
  repository.findByAppSlug.resolves(releases)
  repository.setReleaseDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)

  const usecase = new ViewReleaseIndexUseCase(repository, deployBackend)
  return { usecase, repository, deployBackend, releases }
}

describe('ViewReleaseIndexUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists Succeeded and reflects it when the rollout is Complete', async () => {
    const { usecase, repository, deployBackend, releases } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    const [uuid, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
    expect(status).toBe(DeployStatus.Succeeded)
    expect(result.items[0].deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('persists Failed when the rollout has Failed', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Failed)
    deployBackend.readDeployFailure.resolves(null)

    await usecase.execute(SLUG, firstPage())

    const [, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(status).toBe(DeployStatus.Failed)
  })

  it('attaches the live failure reason to the head release when the deploy has failed', async () => {
    const { usecase, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Failed)
    deployBackend.readDeployFailure.resolves({
      reason: 'ImagePullBackOff',
      message: 'Back-off pulling image "nginx:doesnotexist"',
    })

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.items[0].failureReason).toBe('ImagePullBackOff')
    expect(result.items[0].failureMessage).toBe('Back-off pulling image "nginx:doesnotexist"')
  })

  it('does not read a failure reason when the rollout has not failed', async () => {
    const { usecase, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG, firstPage())

    expect(deployBackend.readDeployFailure.called).toBe(false)
    expect(result.items[0].failureReason).toBeUndefined()
  })

  it('advances Pending to InProgress while the rollout is Progressing', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG, firstPage())

    const [, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(status).toBe(DeployStatus.InProgress)
  })

  it('does not write when the observed status equals the stored one (write-on-change)', async () => {
    const { usecase, repository, deployBackend } = build([release(DeployStatus.InProgress)])
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG, firstPage())

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('never persists on NotFound (absence of observation is not a state)', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.NotFound)

    await usecase.execute(SLUG, firstPage())

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('skips the cluster read entirely when the only release is already terminal', async () => {
    const { usecase, deployBackend } = build([release(DeployStatus.Succeeded)])

    await usecase.execute(SLUG, firstPage())

    expect(deployBackend.readRolloutStatus.called).toBe(false)
  })

  it('reconciles only the latest non-terminal release', async () => {
    const releases = [release(DeployStatus.Pending), release(DeployStatus.Pending)]
    const { usecase, repository, deployBackend } = build(releases)
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    await usecase.execute(SLUG, firstPage())

    expect(deployBackend.readRolloutStatus.calledOnce).toBe(true)
    expect(repository.setReleaseDeployStatus.calledOnce).toBe(true)
    const [uuid] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
  })

  it('does not reconcile on a later page, where releases[0] is not the head', async () => {
    // Page two's first row is an older release. Reconciling it would stamp the
    // current rollout's outcome onto a superseded release — the #98-class false
    // negative the first-page guard exists to prevent.
    const releases = [release(DeployStatus.Pending), release(DeployStatus.Pending)]
    const { usecase, repository, deployBackend } = build(releases)
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(
      SLUG,
      pageAfter(ViewReleaseIndexQueryKey.from(releases[0])),
    )

    expect(deployBackend.readRolloutStatus.called).toBe(false)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
    expect(deployBackend.readDeployFailure.called).toBe(false)
    expect(result.items[0].deployStatus).toBe(DeployStatus.Pending)
  })

  it('builds the next key from the last release returned', async () => {
    const releases = [release(DeployStatus.Succeeded), release(DeployStatus.Succeeded)]
    const { usecase } = build(releases)

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.meta.next).toEqual({ uuid: releases[1].uuid })
  })

  it('reports no next key once a page comes back empty', async () => {
    const { usecase } = build([])

    const result = await usecase.execute(SLUG, firstPage())

    expect(result.meta.next).toBeNull()
  })

  it('leaves an older non-terminal release untouched when the newest is terminal', async () => {
    // A superseded Pending release (older) must not be stamped with the current
    // Deployment's outcome — only the head (Succeeded, terminal) maps to it.
    const releases = [release(DeployStatus.Succeeded), release(DeployStatus.Pending)]
    const { usecase, repository, deployBackend } = build(releases)

    await usecase.execute(SLUG, firstPage())

    expect(deployBackend.readRolloutStatus.called).toBe(false)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
    expect(releases[1].deployStatus).toBe(DeployStatus.Pending)
  })
})
