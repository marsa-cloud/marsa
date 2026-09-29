import { ApiProperty } from '@nestjs/swagger'

export class ViewDatabaseDependentIndexResponse {
  @ApiProperty({
    type: [String],
    example: ['api', 'worker'],
    description: 'Slugs of the apps this database is attached to.',
  })
  readonly items: string[]

  constructor(items: string[]) {
    this.items = items
  }
}
