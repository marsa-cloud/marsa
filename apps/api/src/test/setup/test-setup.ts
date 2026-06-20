import { EntityManager } from '@mikro-orm/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'

import type { TestApp } from '#src/test/setup/test-bench.js'

export class TestSetup {
  static async create(app: TestApp): Promise<TestSetup> {
    const em = app.orm.em.fork()
    const setup = new TestSetup(app.app, app.testModule, em)
    await setup.initialize()
    return setup
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
    public readonly entityManager: EntityManager,
  ) {}

  private async initialize(): Promise<void> {
    await this.entityManager.begin()
  }

  public async teardown(): Promise<void> {
    await this.entityManager.rollback()
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }
}
