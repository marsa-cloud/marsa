import { DocumentBuilder } from '@nestjs/swagger'

export function buildApiDocumentation(version: string) {
  return new DocumentBuilder()
    .setTitle('Marsa API')
    .setDescription('Marsa PaaS HTTP API')
    .setVersion(version)
    .build()
}
