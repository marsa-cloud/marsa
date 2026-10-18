import { UnprocessableEntityException } from '@nestjs/common'

export class InstallationNotFoundError extends UnprocessableEntityException {
  constructor(repo: string) {
    super(`The GitHub App installation for ${repo} no longer exists.`)
  }
}
