import { DocumentBuilder } from '@nestjs/swagger'
import { DEFAULT_AUTH_COOKIE_NAME } from '#src/config/env.config.js'

export const SESSION_COOKIE_SECURITY_SCHEME = 'session'

export function buildApiDocumentation(version: string) {
  return (
    new DocumentBuilder()
      .setTitle('Marsa API')
      .setDescription('Marsa PaaS HTTP API')
      .setVersion(version)
      // Declared per route via @ApiCookieAuth rather than as a root requirement: Nest has no
      // decorator that clears an inherited one, so a @Public route could not opt back out.
      .addCookieAuth(
        DEFAULT_AUTH_COOKIE_NAME,
        { type: 'apiKey', in: 'cookie', name: DEFAULT_AUTH_COOKIE_NAME },
        SESSION_COOKIE_SECURITY_SCHEME,
      )
      .build()
  )
}
