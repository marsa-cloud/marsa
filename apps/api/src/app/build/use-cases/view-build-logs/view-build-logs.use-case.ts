import { Injectable, NotFoundException } from '@nestjs/common'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { ViewBuildLogsRepository } from '#src/app/build/use-cases/view-build-logs/view-build-logs.repository.js'
import { ViewBuildLogsResponse } from '#src/app/build/use-cases/view-build-logs/view-build-logs.response.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'

export const BUILD_LOGS_EXPIRED = 'Build logs are kept for one hour after the build finishes.'

@Injectable()
export class ViewBuildLogsUseCase {
  constructor(
    private readonly repository: ViewBuildLogsRepository,
    private readonly buildRuntime: BuildRuntime,
  ) {}

  async execute(slug: string, buildUuid: BuildUuid): Promise<ViewBuildLogsResponse> {
    const build = await this.repository.findBuild(slug, buildUuid)
    if (!build) {
      throw new NotFoundException(`Build '${buildUuid}' was not found for app '${slug}'.`)
    }
    const logs = await this.buildRuntime.readLogs({ build: { uuid: build.uuid }, app: { slug } })
    if (logs === null) {
      throw new NotFoundException(BUILD_LOGS_EXPIRED)
    }
    return new ViewBuildLogsResponse(logs)
  }
}
