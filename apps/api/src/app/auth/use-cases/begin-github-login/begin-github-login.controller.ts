import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { BeginGithubLoginUseCase } from '#src/app/auth/use-cases/begin-github-login/begin-github-login.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/github', version: '1' })
export class BeginGithubLoginController {
  constructor(private readonly usecase: BeginGithubLoginUseCase) {}

  @Get()
  @ApiOperation({ operationId: 'beginGithubLoginV1' })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description:
      'Redirects to GitHub OAuth consent, or to the setup wizard when no App is provisioned.',
  })
  async handle(@Req() request: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    const result = await this.usecase.execute()

    // No App yet = first-run bootstrap; send the operator to the provisioning
    // wizard instead of dead-ending them with an error.
    if (result.kind === 'setup') {
      res.redirect(result.setupUrl, HttpStatus.FOUND)
      return
    }

    // Bound into the session so complete-login can verify the callback's state
    // matches the request that issued it (#62 login-CSRF).
    request.session.set('oauthState', result.state)
    res.redirect(result.authorizeUrl, HttpStatus.FOUND)
  }
}
