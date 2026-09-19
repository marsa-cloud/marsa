import { before, describe, it } from 'node:test'
import { ConflictException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { CreateProjectCommandBuilder } from '#src/app/project/use-cases/create-project/create-project.command.builder.js'
import { CreateProjectRepository } from '#src/app/project/use-cases/create-project/create-project.repository.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build() {
  const repository = createStubInstance(CreateProjectRepository)
  repository.insert.resolves(true)
  return { usecase: new CreateProjectUseCase(repository), repository }
}

describe('CreateProjectUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('stores the project and returns it', async () => {
    const { usecase, repository } = build()

    const result = await usecase.execute(
      new CreateProjectCommandBuilder().withName('Demo').withSlug('demo').build(),
    )

    expect(result).toMatchObject({ name: 'Demo', slug: 'demo' })
    expect(repository.insert.firstCall.args[0]).toMatchObject({ name: 'Demo', slug: 'demo' })
  })

  it('rejects a taken slug with 409', async () => {
    const { usecase, repository } = build()
    repository.insert.resolves(false)

    await expect(usecase.execute(new CreateProjectCommandBuilder().build())).rejects.toThrow(
      ConflictException,
    )
  })
})
