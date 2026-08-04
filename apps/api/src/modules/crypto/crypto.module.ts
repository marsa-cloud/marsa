import { Global, Module } from '@nestjs/common'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

@Global()
@Module({
  providers: [SecretCipherService, ImagePullCredentialsCipher],
  exports: [SecretCipherService, ImagePullCredentialsCipher],
})
export class CryptoModule {}
