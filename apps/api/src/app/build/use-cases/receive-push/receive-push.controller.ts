import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { Public } from '#src/app/auth/decorators/roles.decorator.js'
import { ReceivePushResponse } from '#src/app/build/use-cases/receive-push/receive-push.response.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'

// GitHub calls this, never the web, so it stays out of the generated client.
@ApiExcludeController()
@Controller({ path: 'github-app/webhooks', version: '1' })
export class ReceivePushController {
  constructor(private readonly usecase: ReceivePushUseCase) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  handle(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-github-event') event?: string,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<ReceivePushResponse> {
    return this.usecase.execute({ event, signature, rawBody: request.rawBody })
  }
}
