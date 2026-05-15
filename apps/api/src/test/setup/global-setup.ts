import { compileTestModule } from '#src/test/setup/compile-test-module.js'

async function globalTestSetup(): Promise<void> {
  const testingModule = await compileTestModule([], true)
  await testingModule.init()

  // TODO: e.g. migrate databse

  console.log('Global setup completed')
  await testingModule.close()
}

void globalTestSetup()
