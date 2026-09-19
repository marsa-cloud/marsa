import { Injectable } from '@nestjs/common'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

// Stateless on purpose: booted apps are cached across e2e suites, and truncation can't reset them.
@Injectable()
export class MockNamespaceBackend extends NamespaceBackend {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(_namespace: string, _environmentUuid: string): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_namespace: string, _environmentUuid: string): Promise<void> {
    return Promise.resolve()
  }
}
