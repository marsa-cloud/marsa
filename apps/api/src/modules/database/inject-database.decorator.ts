import { Inject } from '@nestjs/common'
import { DATABASE } from '#src/modules/database/database.tokens.js'

export const InjectDatabase = (): ParameterDecorator => Inject(DATABASE)
