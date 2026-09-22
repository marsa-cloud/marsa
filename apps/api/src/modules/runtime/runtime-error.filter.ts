import { type ArgumentsHost, Catch, ConflictException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'

@Catch(EnvironmentConflictError)
export class RuntimeErrorFilter extends BaseExceptionFilter {
  catch(error: EnvironmentConflictError, host: ArgumentsHost): void {
    super.catch(new ConflictException(error.message, { cause: error }), host)
  }
}
