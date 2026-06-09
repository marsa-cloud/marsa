import { after } from 'node:test'

import { MikroORM } from '@mikro-orm/core'
import { DynamicModule, Type, ValidationPipe, VersioningType } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import qs from 'qs'

import { AppModule } from '#src/app.module.js'
import { ApiModule } from '#src/modules/api/api.module.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

after(async () => await TestBench.teardown())

export interface TestApp {
  app: NestFastifyApplication
  testModule: TestingModule
  orm: MikroORM
}

export class TestBench {
  private static _apps: Map<Type<unknown> | DynamicModule, TestApp> = new Map()
  private static _isUnitTestSetup: boolean = false

  static async setupEndToEndTest(): Promise<TestSetup> {
    return this.setupIntegrationTest(ApiModule)
  }

  static async setupModuleTest(module: Type<unknown> | DynamicModule): Promise<TestSetup> {
    return await TestBench.setupIntegrationTest(AppModule.forRoot([module]))
  }

  static async setupIntegrationTest(module: Type<unknown> | DynamicModule): Promise<TestSetup> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV must be set to test')
    }

    this.setupUnitTest()

    const app = await this.initApp(module)
    return TestSetup.create(app)
  }

  static setupUnitTest(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV must be set to test')
    }

    if (!this._isUnitTestSetup) {
      this._isUnitTestSetup = true
    }
  }

  static async teardown(): Promise<void> {
    for (const app of this._apps.values()) {
      await app.app.close()
    }
  }

  private static async initApp(module: Type<unknown> | DynamicModule): Promise<TestApp> {
    const moduleKey = module
    const existingApp = this._apps.get(moduleKey)

    if (existingApp) {
      return existingApp
    }

    const testModuleBuilder = Test.createTestingModule({ imports: [module] })
    const testModule = await testModuleBuilder.compile()
    const app = await this.createApp(testModule)
    const orm = testModule.get(MikroORM)
    const testApp: TestApp = { app, testModule, orm }
    this._apps.set(moduleKey, testApp)
    return testApp
  }

  private static async createApp(testModule: TestingModule): Promise<NestFastifyApplication> {
    const adapter = new FastifyAdapter({
      routerOptions: {
        querystringParser: (str) => qs.parse(str),
        ignoreDuplicateSlashes: false,
        caseSensitive: true,
        ignoreTrailingSlash: false,
        allowUnsafeRegex: false,
      },
    })

    const app = testModule.createNestApplication<NestFastifyApplication>(adapter)

    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    )

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    return app
  }
}
