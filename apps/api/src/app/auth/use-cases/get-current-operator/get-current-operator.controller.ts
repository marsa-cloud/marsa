import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'

import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { GetCurrentOperatorResponse } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.response.js'
import { GetCurrentOperatorUseCase } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/me', version: '1' })
export class GetCurrentOperatorController {
  constructor(private readonly usecase: GetCurrentOperatorUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'getCurrentOperatorV1' })
  @ApiOkResponse({ type: GetCurrentOperatorResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  async handle(@Req() request: FastifyRequest): Promise<GetCurrentOperatorResponse> {
    const operatorUuid = request.session.get('operatorUuid') as string
    const operator = await this.usecase.execute(operatorUuid)
    return new GetCurrentOperatorResponse(operator)
  }
}
