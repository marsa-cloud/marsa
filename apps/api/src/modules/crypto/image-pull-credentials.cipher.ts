import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'

/**
 * The JSON-over-{@link SecretCipherService} encoding of `App.imagePullCredentialsEnc`.
 *
 * Sealing and opening are one format, so they live together — a use-case that
 * writes the column and one that reads it can't drift on how the payload is
 * serialized.
 */
@Injectable()
export class ImagePullCredentialsCipher {
  constructor(private readonly cipher: SecretCipherService) {}

  seal(credentials: RegistryCredentials): string {
    return this.cipher.encrypt(JSON.stringify(credentials))
  }

  open(token: string): RegistryCredentials {
    return JSON.parse(this.cipher.decrypt(token)) as RegistryCredentials
  }

  openForApp(slug: string, token: string | null): RegistryCredentials | undefined {
    if (!token) {
      return undefined
    }
    try {
      return this.open(token)
    } catch (error) {
      throw new InternalServerErrorException(
        `Stored image pull credentials for '${slug}' could not be decrypted. ` +
          'Re-enter the registry credentials and deploy again.',
        { cause: error },
      )
    }
  }
}
