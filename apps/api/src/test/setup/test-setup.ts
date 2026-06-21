import { EntityManager, MikroORM } from '@mikro-orm/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'

import type { TestApp } from '#src/test/setup/test-bench.js'

export class TestSetup {
  static async create(app: TestApp): Promise<TestSetup> {
    const em = app.orm.em.fork()
    const setup = new TestSetup(app.app, app.testModule, app.orm, em)
    await setup.initialize()
    return setup
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
    public readonly orm: MikroORM,
    public readonly entityManager: EntityManager,
  ) {}

  private async initialize(): Promise<void> {
    await this.entityManager.begin()
  }

  public async teardown(): Promise<void> {
    // Discard this EM's (empty) transaction, then TRUNCATE every entity table.
    // The request path forks its own EMs and commits on separate connections
    // (request isolation), so those rows never ride the rollback — wiping here
    // is what actually isolates suites. Rollback alone can't, because a fork
    // neither joins the parent's transaction nor shares its connection.
    await this.entityManager.rollback()
    await this.orm.schema.clearDatabase()
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }
}
