import { before, describe, it } from 'node:test'

import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { expect } from 'expect'

import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function contextWithSession(operatorUuid: string | undefined): ExecutionContext {
  const session = { get: () => operatorUuid }
  return {
    switchToHttp: () => ({ getRequest: () => ({ session }) }),
  } as unknown as ExecutionContext
}

describe('SessionAuthGuard', () => {
  before(() => TestBench.setupUnitTest())

  it('allows a request whose session carries an operatorUuid', () => {
    const guard = new SessionAuthGuard()

    expect(guard.canActivate(contextWithSession('operator-uuid'))).toBe(true)
  })

  it('rejects a request with no operatorUuid in session', () => {
    const guard = new SessionAuthGuard()

    expect(() => guard.canActivate(contextWithSession(undefined))).toThrow(UnauthorizedException)
  })
})
