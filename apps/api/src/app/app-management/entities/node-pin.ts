import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  Matches,
} from 'class-validator'
import {
  MAX_NODE_PIN_VALUES,
  NODE_LABEL_KEY_PATTERN,
  NODE_LABEL_VALUE_PATTERN,
} from '#src/app/app-management/entities/node-pin.constants.js'
import {
  PinStrategy,
  PinStrategyApiProperty,
} from '#src/app/app-management/enums/pin-strategy.enum.js'

export class NodePin {
  @ApiProperty({
    type: String,
    example: 'kubernetes.io/hostname',
    description: 'Node label key the pin matches on.',
  })
  @IsString()
  @Matches(NODE_LABEL_KEY_PATTERN, { message: 'key must be a valid Kubernetes label key' })
  key!: string

  @ApiProperty({
    type: [String],
    example: ['node-a', 'node-b'],
    description: 'Accepted label values; the pod may run on any node matching one of them.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_NODE_PIN_VALUES)
  @ArrayUnique()
  @Matches(NODE_LABEL_VALUE_PATTERN, {
    each: true,
    message: 'each value must be a valid Kubernetes label value',
  })
  values!: string[]

  @PinStrategyApiProperty({
    example: PinStrategy.Required,
    description: 'required keeps the pod Pending when no node matches; preferred places it anyway.',
  })
  @IsEnum(PinStrategy)
  strategy!: PinStrategy
}
