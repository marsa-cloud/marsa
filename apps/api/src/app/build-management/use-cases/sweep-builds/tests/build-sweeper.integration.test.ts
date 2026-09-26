import { after, before, describe, it } from 'node:test'
import { SchedulerRegistry } from '@nestjs/schedule'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build-management/entities/build.builder.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BUILD_DISAPPEARED } from '#src/app/build-management/use-cases/complete-build/complete-build.constants.js'
import { BuildSweeper } from '#src/app/build-management/use-cases/sweep-builds/build-sweeper.cron.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import type { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { BuildState } from '#src/modules/runtime/runtime.enums.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('BuildSweeper (integration)', () => {
  let setup: TestSetup
  let environment: Environment
  let seq = 0
  const sweeper = () => setup.testModule.get(BuildSweeper)
  const buildRuntime = () => setup.testModule.get<BuildRuntime, MockBuildRuntime>(BuildRuntime)
  const appRuntime = () => setup.testModule.get<AppRuntime, MockAppRuntime>(AppRuntime)

  async function seed(builder = new BuildBuilder()): Promise<{ app: App; build: Build }> {
    seq += 1
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(`sweep-app-${seq}`)
      .build()
    const build = builder.withApp(app).withCommitSha(`${seq}`.padStart(40, 'f')).build()
    await setup.db.insert(appTable).values(app)
    await setup.db.insert(buildTable).values(build)
    return { app, build }
  }

  const reload = async (build: Build) =>
    (await setup.db.select().from(buildTable).where(eq(buildTable.uuid, build.uuid)))[0]
  const releasesOf = (app: App) =>
    setup.db.select().from(releaseTable).where(eq(releaseTable.appUuid, app.uuid))

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
    environment = (await setup.seedEnvironment()).environment
  })

  after(async () => {
    await setup.teardown()
  })

  it('turns a finished build into a deployed release', async () => {
    const { app, build } = await seed()
    buildRuntime().observe(build.uuid, { state: BuildState.Succeeded })

    await sweeper().sweep()

    const imageRef = `registry.mock.test/${app.slug}:${build.commitSha}`
    expect(await reload(build)).toMatchObject({ status: BuildStatus.Succeeded, imageRef })
    const [saved] = await setup.db.select().from(appTable).where(eq(appTable.uuid, app.uuid))
    expect(saved?.image).toBe(imageRef)
    const releases = await releasesOf(app)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({ buildUuid: build.uuid, imageRef })
    const placement = { project: { slug: 'x' }, environment, app: { slug: app.slug } }
    expect(await appRuntime().readLiveReleaseUuid(placement)).toBe(releases[0].uuid)
  })

  it('records a failed build and deploys nothing', async () => {
    const { app, build } = await seed()
    buildRuntime().observe(build.uuid, { state: BuildState.Failed, reason: 'no Dockerfile' })

    await sweeper().sweep()

    expect(await reload(build)).toMatchObject({
      status: BuildStatus.Failed,
      failureReason: 'no Dockerfile',
    })
    expect(await releasesOf(app)).toHaveLength(0)
    const [saved] = await setup.db.select().from(appTable).where(eq(appTable.uuid, app.uuid))
    expect(saved?.image).toBe(app.image)
  })

  it('fails a build whose job vanished', async () => {
    const { build } = await seed()

    await sweeper().sweep()

    expect(await reload(build)).toMatchObject({
      status: BuildStatus.Failed,
      failureReason: BUILD_DISAPPEARED,
    })
  })

  it('leaves a running build alone', async () => {
    const { build } = await seed()
    buildRuntime().observe(build.uuid, { state: BuildState.Running })

    await sweeper().sweep()

    expect((await reload(build)).status).toBe(BuildStatus.Running)
  })

  it('fails a build stuck past its deadline', async () => {
    const { build } = await seed(
      new BuildBuilder().withCreatedAt(new Date(Date.now() - 3 * 3600_000)),
    )
    buildRuntime().observe(build.uuid, { state: BuildState.Running })

    await sweeper().sweep()

    expect(await reload(build)).toMatchObject({
      status: BuildStatus.Failed,
      failureReason: 'The build exceeded its deadline.',
    })
  })

  it('completes a build only once when two sweeps race', async () => {
    const { app, build } = await seed()
    buildRuntime().observe(build.uuid, { state: BuildState.Succeeded })

    await Promise.all([sweeper().sweep(), sweeper().sweep()])

    expect(await releasesOf(app)).toHaveLength(1)
  })

  it('does not schedule itself under the mock runtime', () => {
    expect(() => setup.testModule.get(SchedulerRegistry, { strict: false })).toThrow()
  })
})
