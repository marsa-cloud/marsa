import { Injectable } from '@nestjs/common'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

export interface PulledImage {
  imageRef: string
  imagePullCredentialsEnc: string | null
}

// Images built into Marsa's registry store no credentials on the release; the registry vends them.
@Injectable()
export class PullCredentials {
  constructor(
    private readonly imageRegistry: ImageRegistry,
    private readonly cipher: ImagePullCredentialsCipher,
  ) {}

  of(appSlug: string, image: PulledImage): RegistryCredentials | undefined {
    return (
      this.imageRegistry.pullCredentialsFor(image.imageRef) ??
      this.cipher.openForApp(appSlug, image.imagePullCredentialsEnc)
    )
  }
}
