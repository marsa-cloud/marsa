import { Injectable, NotFoundException } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { appConfigOf, snapshotOf } from '#src/app/release/entities/release-snapshot.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { CreateReleaseCommand } from '#src/app/release/use-cases/create-release/create-release.command.js'
import { CreateReleaseRepository } from '#src/app/release/use-cases/create-release/create-release.repository.js'
import { CreateReleaseResponse } from '#src/app/release/use-cases/create-release/create-release.response.js'

@Injectable()
export class CreateReleaseUseCase {
  constructor(private readonly repository: CreateReleaseRepository) {}

  async execute(slug: string, command: CreateReleaseCommand): Promise<CreateReleaseResponse> {
    const app = await this.repository.findAppBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    const source = command.fromReleaseUuid
      ? await this.findSource(app, command.fromReleaseUuid as ReleaseUuid)
      : null

    const release = new ReleaseBuilder()
      .withApp(app)
      .withSnapshot(source ?? snapshotOf(app))
      .withTriggeredBy(source ? ReleaseTrigger.Rollback : ReleaseTrigger.Manual)
      .withSourceReleaseUuid(source?.uuid ?? null)
      .withDeployStatus(DeployStatus.Pending)
      .build()

    await this.repository.createRelease(release, source ? appConfigOf(source) : null)

    return new CreateReleaseResponse(app, release)
  }

  private async findSource(app: App, uuid: ReleaseUuid): Promise<Release> {
    const source = await this.repository.findRelease(uuid)
    if (!source || source.appUuid !== app.uuid) {
      throw new NotFoundException(`Release '${uuid}' was not found for app '${app.slug}'.`)
    }
    return source
  }
}
