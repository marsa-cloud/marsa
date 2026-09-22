import { Injectable } from '@nestjs/common'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

// Otherwise stateless: booted apps are cached across e2e suites, and truncation can't reset them.
@Injectable()
export class MockEnvironmentRuntime extends EnvironmentRuntime {
  private nextProvisionError?: Error

  failNextProvision(error: Error): void {
    this.nextProvisionError = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(_environment: EnvironmentRef): Promise<void> {
    const error = this.nextProvisionError
    this.nextProvisionError = undefined
    return error ? Promise.reject(error) : Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_environment: EnvironmentRef): Promise<void> {
    return Promise.resolve()
  }
}
