import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Release } from '#src/app/release/entities/release.table.js'
import { renderManifests } from '#src/app/release/render/render-manifests.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RegistryCredentials } from '#src/modules/kubernetes/deploy-backend.types.js'

@Injectable()
export class ApplyReleaseService {
  readonly baseDomain: string

  constructor(
    private readonly deployBackend: DeployBackend,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async apply(slug: string, release: Release): Promise<void> {
    const credentials = this.openCredentials(slug, release)
    const manifests = renderManifests(slug, release, this.baseDomain, credentials)
    await this.deployBackend.apply(OPERATOR_APPS_NAMESPACE, manifests)
  }

  private openCredentials(slug: string, release: Release): RegistryCredentials | undefined {
    if (!release.imagePullCredentialsEnc) {
      return undefined
    }

    try {
      return this.credentialsCipher.open(release.imagePullCredentialsEnc)
    } catch (error) {
      throw new InternalServerErrorException(
        `Stored image pull credentials for '${slug}' could not be decrypted. ` +
          'Re-enter the registry credentials and deploy again.',
        { cause: error },
      )
    }
  }
}
