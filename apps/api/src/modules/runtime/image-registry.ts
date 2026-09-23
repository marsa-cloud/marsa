import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

export abstract class ImageRegistry {
  // Undefined for an image outside Marsa's registry, so the app's own credentials apply.
  abstract pullCredentialsFor(imageRef: string): RegistryCredentials | undefined

  // Idempotent: a repository that never existed or is already gone counts as deleted.
  abstract deleteRepository(appSlug: string): Promise<void>

  abstract imageRefFor(appSlug: string, tag: string): string

  abstract pushRefFor(appSlug: string, tag: string): string
}
