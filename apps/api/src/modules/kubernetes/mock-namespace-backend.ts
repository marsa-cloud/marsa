import { Injectable } from '@nestjs/common'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

// Otherwise stateless: booted apps are cached across e2e suites, and truncation can't reset them.
// The failure flag self-clears on use so one armed test can't leak into the next suite.
@Injectable()
export class MockNamespaceBackend extends NamespaceBackend {
  private nextProvisionError?: Error

  failNextProvision(error: Error): void {
    this.nextProvisionError = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(_namespace: string, _environmentUuid: string): Promise<void> {
    const error = this.nextProvisionError
    this.nextProvisionError = undefined
    return error ? Promise.reject(error) : Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_namespace: string, _environmentUuid: string): Promise<void> {
    return Promise.resolve()
  }
}
