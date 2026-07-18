import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { ListAppReleasesRepository } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.repository.js'
import { ListAppReleasesUseCase } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.use-case.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const SLUG = 'my-app'

function release(deployStatus: DeployStatus) {
  const app = new AppBuilder().withSlug(SLUG).build()
  return new ReleaseBuilder().withApp(app).withDeployStatus(deployStatus).build()
}

function build(releases = [release(DeployStatus.Pending)]) {
  const repository = createStubInstance(ListAppReleasesRepository)
  repository.findByAppSlug.resolves(releases)
  repository.setReleaseDeployStatus.resolves()

  const deployBackend = createStubInstance(MockDeployBackend)

  const usecase = new ListAppReleasesUseCase(repository, deployBackend)
  return { usecase, repository, deployBackend, releases }
}

describe('ListAppReleasesUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('persists Succeeded and reflects it when the rollout is Complete', async () => {
    const { usecase, repository, deployBackend, releases } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG)

    const [uuid, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
    expect(status).toBe(DeployStatus.Succeeded)
    expect(result.releases[0].deployStatus).toBe(DeployStatus.Succeeded)
  })

  it('persists Failed when the rollout has Failed', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Failed)
    deployBackend.readDeployFailure.resolves(null)

    await usecase.execute(SLUG)

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

    const result = await usecase.execute(SLUG)

    expect(result.releases[0].failureReason).toBe('ImagePullBackOff')
    expect(result.releases[0].failureMessage).toBe('Back-off pulling image "nginx:doesnotexist"')
  })

  it('does not read a failure reason when the rollout has not failed', async () => {
    const { usecase, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    const result = await usecase.execute(SLUG)

    expect(deployBackend.readDeployFailure.called).toBe(false)
    expect(result.releases[0].failureReason).toBeUndefined()
  })

  it('advances Pending to InProgress while the rollout is Progressing', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG)

    const [, status] = repository.setReleaseDeployStatus.firstCall.args
    expect(status).toBe(DeployStatus.InProgress)
  })

  it('does not write when the observed status equals the stored one (write-on-change)', async () => {
    const { usecase, repository, deployBackend } = build([release(DeployStatus.InProgress)])
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Progressing)

    await usecase.execute(SLUG)

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('never persists on NotFound (absence of observation is not a state)', async () => {
    const { usecase, repository, deployBackend } = build()
    deployBackend.readRolloutStatus.resolves(RolloutStatus.NotFound)

    await usecase.execute(SLUG)

    expect(repository.setReleaseDeployStatus.called).toBe(false)
  })

  it('skips the cluster read entirely when the only release is already terminal', async () => {
    const { usecase, deployBackend } = build([release(DeployStatus.Succeeded)])

    await usecase.execute(SLUG)

    expect(deployBackend.readRolloutStatus.called).toBe(false)
  })

  it('reconciles only the latest non-terminal release', async () => {
    const releases = [release(DeployStatus.Pending), release(DeployStatus.Pending)]
    const { usecase, repository, deployBackend } = build(releases)
    deployBackend.readRolloutStatus.resolves(RolloutStatus.Complete)

    await usecase.execute(SLUG)

    expect(deployBackend.readRolloutStatus.calledOnce).toBe(true)
    expect(repository.setReleaseDeployStatus.calledOnce).toBe(true)
    const [uuid] = repository.setReleaseDeployStatus.firstCall.args
    expect(uuid).toBe(releases[0].uuid)
  })

  it('leaves an older non-terminal release untouched when the newest is terminal', async () => {
    // A superseded Pending release (older) must not be stamped with the current
    // Deployment's outcome — only the head (Succeeded, terminal) maps to it.
    const releases = [release(DeployStatus.Succeeded), release(DeployStatus.Pending)]
    const { usecase, repository, deployBackend } = build(releases)

    await usecase.execute(SLUG)

    expect(deployBackend.readRolloutStatus.called).toBe(false)
    expect(repository.setReleaseDeployStatus.called).toBe(false)
    expect(releases[1].deployStatus).toBe(DeployStatus.Pending)
  })
})
