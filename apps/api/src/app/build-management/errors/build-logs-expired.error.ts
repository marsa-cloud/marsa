import { NotFoundException } from '@nestjs/common'

export class BuildLogsExpiredError extends NotFoundException {
  constructor() {
    super('Build logs are kept for one hour after the build finishes.')
  }
}
