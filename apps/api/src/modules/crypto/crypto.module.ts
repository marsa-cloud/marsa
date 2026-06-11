import { Global, Module } from '@nestjs/common'

import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

@Global()
@Module({
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class CryptoModule {}
