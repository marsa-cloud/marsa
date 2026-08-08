import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { renderManifests } from '#src/app/release/render/render-manifests.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RegistryCredentials } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * The cluster-facing half of a deploy, shared by `deploy-app` and
 * `redeploy-app`: render a release's manifests and apply them. Persisting the
 * outcome stays with each use-case, which owns its own repository.
 */
@Injectable()
export class ApplyReleaseService {
  readonly baseDomain: string

  constructor(
    private readonly deployBackend: DeployBackend,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async apply(app: App, release: Release, credentials?: RegistryCredentials): Promise<void> {
    const manifests = renderManifests(app, release, this.baseDomain, credentials)
    await this.deployBackend.apply(OPERATOR_APPS_NAMESPACE, manifests)
  }
}
