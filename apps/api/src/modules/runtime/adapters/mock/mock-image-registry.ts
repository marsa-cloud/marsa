import { Injectable } from '@nestjs/common'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

export const MOCK_REGISTRY_HOST = 'registry.mock.test'

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

  imageRefFor(appSlug: string, tag: string): string {
    return `${MOCK_REGISTRY_HOST}/${appSlug}:${tag}`
  }

  pushRefFor(appSlug: string, tag: string): string {
    return `${MOCK_REGISTRY_HOST}/${appSlug}:${tag}`
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
