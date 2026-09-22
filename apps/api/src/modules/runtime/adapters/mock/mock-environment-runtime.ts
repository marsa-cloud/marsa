import { Injectable } from '@nestjs/common'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

// Otherwise stateless: booted apps are cached across e2e suites, and truncation can't reset them.
@Injectable()
export class MockEnvironmentRuntime extends EnvironmentRuntime {
  private readonly armedFailures = new Map<'provision' | 'destroy', Error>()

  failNext(operation: 'provision' | 'destroy', error: Error): void {
    this.armedFailures.set(operation, error)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(_environment: EnvironmentRef): Promise<void> {
    return this.settle('provision')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_environment: EnvironmentRef): Promise<void> {
    return this.settle('destroy')
  }

  private settle(operation: 'provision' | 'destroy'): Promise<void> {
    const failure = this.armedFailures.get(operation)
    this.armedFailures.delete(operation)
    return failure ? Promise.reject(failure) : Promise.resolve()
  }
}
