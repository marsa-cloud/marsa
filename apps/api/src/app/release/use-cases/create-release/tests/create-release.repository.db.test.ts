import { after, before, beforeEach, describe, it } from 'node:test'
import { eq } from 'drizzle-orm'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { CreateReleaseModule } from '#src/app/release/use-cases/create-release/create-release.module.js'
import { CreateReleaseRepository } from '#src/app/release/use-cases/create-release/create-release.repository.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

const LOCK_NOT_AVAILABLE = '55P03'

function pgCode(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const code = (current as Error & { code?: string }).code
    if (code) {
      return code
    }
  }
  return undefined
}

// Unreachable over HTTP: a concurrent edit landing mid-snapshot needs two requests racing.
describe('CreateReleaseRepository (db)', () => {
  let setup: TestSetup
  let repository: CreateReleaseRepository

  before(async () => {
    setup = await TestBench.setupModuleTest(CreateReleaseModule)
    repository = setup.testModule.get(CreateReleaseRepository)
  })

  beforeEach(() => setup.teardown())

  after(() => setup.teardown())

  it('holds the app row until the snapshot commits, so a concurrent edit cannot interleave', async () => {
    const { environment } = await setup.seedEnvironment()
    const app = new AppBuilder().withEnvironmentUuid(environment.uuid).withSlug('lock-me').build()
    await setup.db.insert(appTable).values(app)

    let concurrent: unknown
    await setup.db.transaction(async (tx) => {
      await repository.findAppBySlug(tx, 'lock-me')
      concurrent = await setup.db
        .select()
        .from(appTable)
        .where(eq(appTable.slug, 'lock-me'))
        .for('update', { noWait: true })
        .catch((error: unknown) => error)
    })

    expect(pgCode(concurrent)).toBe(LOCK_NOT_AVAILABLE)
  })
})
