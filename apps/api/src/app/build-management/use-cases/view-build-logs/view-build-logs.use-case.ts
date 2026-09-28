import { Injectable, NotFoundException } from '@nestjs/common'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { buildRefOf } from '#src/app/build-management/entities/build-ref.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildLogsExpiredError } from '#src/app/build-management/errors/build-logs-expired.error.js'
import { DEFAULT_TAIL_LINES } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.constants.js'
import { ViewBuildLogsRepository } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.repository.js'
import { ViewBuildLogsResponse } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.response.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'

@Injectable()
export class ViewBuildLogsUseCase {
  constructor(
    private readonly repository: ViewBuildLogsRepository,
    private readonly buildRuntime: BuildRuntime,
  ) {}

  async execute(
    slug: string,
    buildUuid: BuildUuid,
    tailLines = DEFAULT_TAIL_LINES,
  ): Promise<ViewBuildLogsResponse> {
    const build = await this.repository.findBuild(slug, buildUuid)
    if (!build) {
      throw new NotFoundException(`Build '${buildUuid}' was not found for app '${slug}'.`)
    }
    const logs = await this.buildRuntime.readLogs(buildRefOf(slug, build.uuid), { tailLines })
    if (logs !== null) {
      return new ViewBuildLogsResponse(logs)
    }
    // A running build's pod may not exist yet; its logs are pending, not expired.
    if (build.status === BuildStatus.Running) {
      return new ViewBuildLogsResponse('')
    }
    throw new BuildLogsExpiredError()
  }
}
