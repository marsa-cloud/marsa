import fastifySecureSession from '@fastify/secure-session'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import QueryString from 'qs'

import { ApiModule } from '#src/modules/api/api.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    ApiModule,
    new FastifyAdapter({
      routerOptions: {
        querystringParser: (str) => QueryString.parse(str),
        ignoreDuplicateSlashes: false,
        caseSensitive: true,
        ignoreTrailingSlash: false,
        allowUnsafeRegex: false,
      },
    }),
  )

  const config = app.get(ConfigService)

  await app.register(fastifySecureSession, {
    key: config.getOrThrow<string>('AUTH_SESSION_SECRET_KEY'),
    cookieName: config.getOrThrow<string>('AUTH_COOKIE_NAME'),
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.getOrThrow('NODE_ENV') === 'production',
    },
  })

  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
  })
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  )

  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0')
}

void bootstrap()
