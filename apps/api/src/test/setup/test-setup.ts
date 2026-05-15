import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Server } from 'http'

import { TestApp } from '#src/test/setup/test-bench.js'

export class TestSetup {
  static async create(app: TestApp): Promise<TestSetup> {
    const setup = new TestSetup(app.app, app.testModule)

    await setup.initialize()

    return setup
  }

  private constructor(
    public readonly app: NestFastifyApplication,
    public readonly testModule: TestingModule,
    // public readonly dataSource,
    // public readonly authContext,
  ) {}

  private initialize(): Promise<void> {
    // TODO: start DB transaction.
    return Promise.resolve()
  }

  public teardown(): Promise<void> {
    // TODO: rollback DB transaction.
    return Promise.resolve()
  }

  public get httpServer(): Server {
    return this.app.getHttpServer()
  }

  // TODO: Depends if we use TypeORM or not
  //   public get entityManager() {}
}
