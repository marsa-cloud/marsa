import { Injectable, NotFoundException } from '@nestjs/common'
import { appRefOf } from '#src/app/app-management/queries/app-placement.js'
import { DEFAULT_TAIL_LINES } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.constants.js'
import { ViewAppLogsRepository } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.repository.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
export class ViewAppLogsUseCase {
  constructor(
    private readonly repository: ViewAppLogsRepository,
    private readonly appRuntime: AppRuntime,
  ) {}

  async execute(slug: string, tailLines?: number): Promise<ViewAppLogsResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const logs = await this.appRuntime.readRunLogs(appRefOf(placement), {
      tailLines: tailLines ?? DEFAULT_TAIL_LINES,
    })
    return new ViewAppLogsResponse(logs)
  }
}
