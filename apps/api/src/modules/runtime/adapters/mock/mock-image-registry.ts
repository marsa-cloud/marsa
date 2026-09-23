import { Injectable } from '@nestjs/common'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class MockImageRegistry extends ImageRegistry {
  readonly deletedRepositories: string[] = []
  private armedFailure: Error | null = null

  failNextDelete(error: Error): void {
    this.armedFailure = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pullCredentialsFor(_imageRef: string): RegistryCredentials | undefined {
    return undefined
  }

  deleteRepository(appSlug: string): Promise<void> {
    const failure = this.armedFailure
    this.armedFailure = null
    if (failure) {
      return Promise.reject(failure)
    }
    this.deletedRepositories.push(appSlug)
    return Promise.resolve()
  }
}
