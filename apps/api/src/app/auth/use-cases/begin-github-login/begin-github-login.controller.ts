import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/github', version: '1' })
export class BeginGithubLoginController {
  constructor(private readonly usecase: BeginGithubLoginUseCase) {}

  @Get()
  @ApiOperation({ operationId: 'beginGithubLoginV1' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to GitHub OAuth consent.' })
  @ApiBadRequestResponse({ description: 'No provisioned GitHub App — create the App first.' })
  async handle(@Req() request: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    const { authorizeUrl, state } = await this.usecase.execute()
    // Bound into the session so complete-login can verify the callback's state
    // matches the request that issued it (#62 login-CSRF).
    request.session.set('oauthState', state)
    res.redirect(authorizeUrl, HttpStatus.FOUND)
  }
}
