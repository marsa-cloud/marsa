import { Injectable } from '@nestjs/common'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { DatabaseCredentials } from '#src/modules/runtime/runtime.types.js'

/** The JSON-over-{@link SecretCipherService} encoding of `database.credentialsEnc`. */
@Injectable()
export class DatabaseCredentialsCipher {
  constructor(private readonly cipher: SecretCipherService) {}

  seal(credentials: DatabaseCredentials): string {
    return this.cipher.encrypt(JSON.stringify(credentials))
  }

  open(token: string): DatabaseCredentials {
    return JSON.parse(this.cipher.decrypt(token)) as DatabaseCredentials
  }
}
