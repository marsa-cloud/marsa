import { before, describe, it } from 'node:test'
import { type ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import {
  PUBLIC_METADATA_KEY,
  ROLES_METADATA_KEY,
} from '#src/app/auth/decorators/roles.decorator.js'
import { RolesGuard } from '#src/app/auth/guards/roles.guard.js'
import { UserRoleService } from '#src/app/auth/services/user-role/user-role.service.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { generateUuid } from '#src/utils/uuid.js'

class UndecoratedController {}

function contextWithSession(userUuid?: UserUuid): ExecutionContext {
  return {
    getHandler: () => UndecoratedController,
    getClass: () => UndecoratedController,
    switchToHttp: () => ({ getRequest: () => ({ session: { get: () => userUuid } }) }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  before(() => TestBench.setupUnitTest())

  it('refuses everyone when a route declares no roles and is not public', async () => {
    const reflector = createStubInstance(Reflector)
    reflector.getAllAndOverride.returns(undefined)
    const userRoles = createStubInstance(UserRoleService)
    const guard = new RolesGuard(reflector, userRoles)

    await expect(guard.canActivate(contextWithSession(generateUuid<UserUuid>()))).rejects.toThrow(
      ForbiddenException,
    )
    expect(userRoles.loadRole.called).toBe(false)
  })

  it('refuses everyone when the declared role list is empty', async () => {
    const reflector = createStubInstance(Reflector)
    reflector.getAllAndOverride.withArgs(PUBLIC_METADATA_KEY).returns(undefined)
    reflector.getAllAndOverride.withArgs(ROLES_METADATA_KEY).returns([])
    const userRoles = createStubInstance(UserRoleService)
    const guard = new RolesGuard(reflector, userRoles)

    await expect(guard.canActivate(contextWithSession(generateUuid<UserUuid>()))).rejects.toThrow(
      ForbiddenException,
    )
    expect(userRoles.loadRole.called).toBe(false)
  })

  it('lets a public route through without reading a role', async () => {
    const reflector = createStubInstance(Reflector)
    reflector.getAllAndOverride.withArgs(PUBLIC_METADATA_KEY).returns(true)
    const userRoles = createStubInstance(UserRoleService)
    const guard = new RolesGuard(reflector, userRoles)

    expect(await guard.canActivate(contextWithSession())).toBe(true)
    expect(userRoles.loadRole.called).toBe(false)
  })

  it('admits a declared role', async () => {
    const reflector = createStubInstance(Reflector)
    reflector.getAllAndOverride.withArgs(PUBLIC_METADATA_KEY).returns(undefined)
    reflector.getAllAndOverride.withArgs(ROLES_METADATA_KEY).returns([UserRole.Operator])
    const userRoles = createStubInstance(UserRoleService)
    userRoles.loadRole.resolves(UserRole.Operator)
    const guard = new RolesGuard(reflector, userRoles)

    expect(await guard.canActivate(contextWithSession(generateUuid<UserUuid>()))).toBe(true)
  })
})
