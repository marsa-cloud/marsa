import { before, describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { DeleteProjectRepository } from '#src/app/project/use-cases/delete-project/delete-project.repository.js'
import { DeleteProjectUseCase } from '#src/app/project/use-cases/delete-project/delete-project.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build(outcome: 'deleted' | 'not-found' | 'in-use') {
  const repository = createStubInstance(DeleteProjectRepository)
  repository.delete.resolves(outcome)
  return new DeleteProjectUseCase(repository)
}

describe('DeleteProjectUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('deletes an empty project', async () => {
    await build('deleted').execute('demo')
  })

  it('throws 404 for an unknown project', async () => {
    await expect(build('not-found').execute('ghost')).rejects.toThrow(NotFoundException)
  })

  it('throws 409 while the project still has environments', async () => {
    await expect(build('in-use').execute('demo')).rejects.toThrow(ConflictException)
  })
})
