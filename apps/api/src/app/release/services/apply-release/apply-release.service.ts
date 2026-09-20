import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { renderManifests } from '#src/app/release/render/render-manifests.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RegistryCredentials } from '#src/modules/kubernetes/deploy-backend.types.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class ApplyReleaseService {
  readonly baseDomain: string

  constructor(
    private readonly deployBackend: DeployBackend,
    private readonly namespaces: NamespaceBackend,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async apply({ app, project, environment }: AppPlacement, release: Release): Promise<void> {
    const credentials = this.openCredentials(app.slug, release)
    const manifests = renderManifests({
      slug: app.slug,
      release,
      baseDomain: this.baseDomain,
      credentials,
      nodePin: app.nodePin,
    })
    const namespace = namespaceOf(project, environment)

    // Also heals a namespace someone deleted by hand; a no-op when it already exists.
    try {
      await this.namespaces.provision(namespace, environment.uuid)
    } catch (error) {
      if (error instanceof NamespaceConflictError) {
        throw new ConflictException(error.message)
      }
      throw error
    }
    await this.deployBackend.apply(namespace, manifests)
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
