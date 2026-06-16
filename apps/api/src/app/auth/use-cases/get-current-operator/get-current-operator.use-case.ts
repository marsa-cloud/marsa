import { Injectable, UnauthorizedException } from '@nestjs/common'

import { Operator } from '#src/app/auth/entities/operator.entity.js'
import { GetCurrentOperatorRepository } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.repository.js'

@Injectable()
export class GetCurrentOperatorUseCase {
  constructor(private readonly repository: GetCurrentOperatorRepository) {}

  async execute(operatorUuid: string): Promise<Operator> {
    const operator = await this.repository.loadByUuid(operatorUuid)
    if (!operator) {
      throw new UnauthorizedException('No active session.')
    }
    return operator
  }
}
