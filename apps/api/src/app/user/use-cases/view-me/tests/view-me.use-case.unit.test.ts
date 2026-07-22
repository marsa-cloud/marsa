import { before, describe, it } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { ViewMeRepository } from '#src/app/user/use-cases/view-me/view-me.repository.js'
import { ViewMeUseCase } from '#src/app/user/use-cases/view-me/view-me.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('ViewMeUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('returns the user matching the session uuid', async () => {
    const user = new UserBuilder().build()
    const repository = createStubInstance(ViewMeRepository)
    repository.loadByUuid.resolves(user)

    const usecase = new ViewMeUseCase(repository)

    expect(await usecase.execute(user.uuid)).toBe(user)
  })

  it('rejects with 401 when the session uuid matches no user', async () => {
    const repository = createStubInstance(ViewMeRepository)
    repository.loadByUuid.resolves(null)

    const usecase = new ViewMeUseCase(repository)

    await expect(usecase.execute(generateUuid())).rejects.toThrow(UnauthorizedException)
  })
})
