import { before, describe, it } from 'node:test'

import { UnauthorizedException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'

import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { GetCurrentUserRepository } from '#src/app/user/use-cases/get-current-user/get-current-user.repository.js'
import { GetCurrentUserUseCase } from '#src/app/user/use-cases/get-current-user/get-current-user.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('GetCurrentUserUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('returns the user matching the session uuid', async () => {
    const user = new UserBuilder().build()
    const repository = createStubInstance(GetCurrentUserRepository)
    repository.loadByUuid.resolves(user)

    const usecase = new GetCurrentUserUseCase(repository)

    expect(await usecase.execute(user.uuid)).toBe(user)
  })

  it('rejects with 401 when the session uuid matches no user', async () => {
    const repository = createStubInstance(GetCurrentUserRepository)
    repository.loadByUuid.resolves(null)

    const usecase = new GetCurrentUserUseCase(repository)

    await expect(usecase.execute(generateUuid())).rejects.toThrow(UnauthorizedException)
  })
})
