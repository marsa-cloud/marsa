import { before, describe, it } from 'node:test'

import { UnauthorizedException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { OperatorBuilder } from '#src/app/auth/entities/operator.builder.js'
import { GetCurrentOperatorRepository } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.repository.js'
import { GetCurrentOperatorUseCase } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetCurrentOperatorUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('returns the operator matching the session uuid', async () => {
    const operator = new OperatorBuilder().build()
    const repository = createStubInstance(GetCurrentOperatorRepository)
    repository.loadByUuid.resolves(operator)

    const usecase = new GetCurrentOperatorUseCase(repository)

    expect(await usecase.execute(operator.uuid)).toBe(operator)
  })

  it('rejects with 401 when the session uuid matches no operator', async () => {
    const repository = createStubInstance(GetCurrentOperatorRepository)
    repository.loadByUuid.resolves(null)

    const usecase = new GetCurrentOperatorUseCase(repository)

    await expect(usecase.execute('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      UnauthorizedException,
    )
  })
})
