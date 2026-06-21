import type { DynamicModule, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'

import { TestModule } from '#src/test/test.module.js'

export async function compileTestModule(
  modules: Array<DynamicModule | Type<unknown>> = [],
  migrationsRun = false,
) {
  return await Test.createTestingModule({
    imports: [TestModule.forRoot(modules, migrationsRun)],
  }).compile()
}
