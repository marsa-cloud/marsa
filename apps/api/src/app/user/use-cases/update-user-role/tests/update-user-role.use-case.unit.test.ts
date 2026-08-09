import { before, describe, it } from 'node:test'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { UpdateUserRoleCommandBuilder } from '#src/app/user/use-cases/update-user-role/update-user-role.command.builder.js'
import { UpdateUserRoleRepository } from '#src/app/user/use-cases/update-user-role/update-user-role.repository.js'
import { UpdateUserRoleUseCase } from '#src/app/user/use-cases/update-user-role/update-user-role.use-case.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

describe('UpdateUserRoleUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('refuses to change the acting operator’s own role', async () => {
    const repository = createStubInstance(UpdateUserRoleRepository)
    const usecase = new UpdateUserRoleUseCase(repository)
    const self = generateUuid<UserUuid>()

    await expect(
      usecase.execute(self, self, new UpdateUserRoleCommandBuilder().build()),
    ).rejects.toThrow(BadRequestException)
    expect(repository.updateRole.called).toBe(false)
  })

  it('throws NotFound when the target row is gone', async () => {
    const repository = createStubInstance(UpdateUserRoleRepository)
    repository.updateRole.resolves(null)
    const usecase = new UpdateUserRoleUseCase(repository)

    await expect(
      usecase.execute(
        generateUuid<UserUuid>(),
        generateUuid<UserUuid>(),
        new UpdateUserRoleCommandBuilder().build(),
      ),
    ).rejects.toThrow(NotFoundException)
  })

  it('returns the updated user on success', async () => {
    const repository = createStubInstance(UpdateUserRoleRepository)
    const promoted = new UserBuilder().withRole(UserRole.Member).build()
    repository.updateRole.resolves(promoted)
    const usecase = new UpdateUserRoleUseCase(repository)

    const response = await usecase.execute(
      generateUuid<UserUuid>(),
      promoted.uuid,
      new UpdateUserRoleCommandBuilder().build(),
    )

    expect(response).toMatchObject({ uuid: promoted.uuid, role: UserRole.Member })
  })
})
