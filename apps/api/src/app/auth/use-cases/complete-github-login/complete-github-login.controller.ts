import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'
import { CompleteGithubLoginResponse } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.response.js'
import { CompleteGithubLoginUseCase } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/github/session', version: '1' })
export class CompleteGithubLoginController {
  constructor(private readonly usecase: CompleteGithubLoginUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: 'completeGithubLoginV1' })
  @ApiOkResponse({ type: CompleteGithubLoginResponse })
  @ApiBadRequestResponse({ description: 'Invalid/expired OAuth state, or no provisioned App.' })
  @ApiBadGatewayResponse({ description: 'Could not complete login with GitHub.' })
  async handle(
    @Body() body: CompleteGithubLoginCommand,
    @Req() request: FastifyRequest,
  ): Promise<CompleteGithubLoginResponse> {
    const sessionState = request.session.get('oauthState')
    // Single-use regardless of outcome — a failed attempt shouldn't leave the
    // CSRF token sitting in the session for a retry.
    request.session.set('oauthState', undefined)

    const user = await this.usecase.execute(body, sessionState)
    request.session.set('userUuid', user.uuid)
    return new CompleteGithubLoginResponse(user)
  }
}
