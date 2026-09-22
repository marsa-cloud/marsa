import { describe, it } from 'node:test'
import { InternalServerErrorException } from '@nestjs/common'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

describe('ImagePullCredentialsCipher.openForApp', () => {
  it('explains an undecryptable token instead of leaking the cipher error', () => {
    const secrets = createStubInstance(SecretCipherService)
    secrets.decrypt.throws(new Error('bad tag'))
    const cipher = new ImagePullCredentialsCipher(secrets)

    expect(() => cipher.openForApp('my-app', 'sealed')).toThrow(InternalServerErrorException)
    expect(() => cipher.openForApp('my-app', 'sealed')).toThrow(/could not be decrypted/)
  })

  it('opens a valid token', () => {
    const secrets = createStubInstance(SecretCipherService)
    secrets.decrypt.returns('{"registry":"ghcr.io","username":"org","password":"pw"}')

    const credentials = new ImagePullCredentialsCipher(secrets).openForApp('my-app', 'sealed')

    expect(credentials).toEqual({ registry: 'ghcr.io', username: 'org', password: 'pw' })
  })
})
