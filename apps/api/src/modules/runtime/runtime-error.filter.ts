import { type ArgumentsHost, Catch, ConflictException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { AppDeletionConflictError } from '#src/app/app-management/errors/app-deletion-conflict.error.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'

@Catch(EnvironmentConflictError, AppDeletionConflictError)
export class RuntimeErrorFilter extends BaseExceptionFilter {
  catch(error: EnvironmentConflictError | AppDeletionConflictError, host: ArgumentsHost): void {
    super.catch(new ConflictException(error.message, { cause: error }), host)
  }
}
