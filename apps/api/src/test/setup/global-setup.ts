import { MikroORM } from '@mikro-orm/core'
import { compileTestModule } from '#src/test/setup/compile-test-module.js'

async function globalTestSetup(): Promise<void> {
  const testingModule = await compileTestModule([], true)
  await testingModule.init()

  const orm = testingModule.get(MikroORM)
  await orm.migrator.up()

  console.log('Global setup completed')
  await testingModule.close()
}

void globalTestSetup()
