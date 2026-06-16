import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'

import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/github', version: '1' })
export class BeginGithubLoginController {
  constructor(private readonly usecase: BeginGithubLoginUseCase) {}

  @Get()
  @ApiOperation({ operationId: 'beginGithubLoginV1' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to GitHub OAuth consent.' })
  @ApiBadRequestResponse({ description: 'No provisioned GitHub App — create the App first.' })
  async handle(@Res() res: FastifyReply): Promise<void> {
    const authorizeUrl = await this.usecase.execute()
    res.redirect(authorizeUrl, HttpStatus.FOUND)
  }
}
