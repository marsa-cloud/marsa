import { type EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'

@Injectable()
export class ListAppReleasesRepository {
  constructor(@InjectRepository(Release) private readonly releases: EntityRepository<Release>) {}

  async findByAppSlug(slug: string): Promise<Release[]> {
    return this.releases.find({ app: { slug } }, { orderBy: { createdAt: 'DESC' } })
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.releases.nativeUpdate({ uuid }, { deployStatus })
  }
}
