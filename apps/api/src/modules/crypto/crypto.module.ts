import { Global, Module } from '@nestjs/common'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

@Global()
@Module({
  providers: [SecretCipherService, ImagePullCredentialsCipher, DatabaseCredentialsCipher],
  exports: [SecretCipherService, ImagePullCredentialsCipher, DatabaseCredentialsCipher],
})
export class CryptoModule {}
