import { Injectable } from '@nestjs/common'
import type { Release } from '#src/app/release/entities/release.table.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

// Images built into Marsa's registry store no credentials on the release; the registry vends them.
@Injectable()
export class ReleasePullCredentials {
  constructor(
    private readonly imageRegistry: ImageRegistry,
    private readonly cipher: ImagePullCredentialsCipher,
  ) {}

  of(
    appSlug: string,
    release: Pick<Release, 'imageRef' | 'imagePullCredentialsEnc'>,
  ): RegistryCredentials | undefined {
    return (
      this.imageRegistry.pullCredentialsFor(release.imageRef) ??
      this.cipher.openForApp(appSlug, release.imagePullCredentialsEnc)
    )
  }
}
