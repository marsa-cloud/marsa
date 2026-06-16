import fastifySecureSession from '@fastify/secure-session'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import QueryString from 'qs'

import { authConfig } from '#src/app/auth/auth.config.js'
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

  await app.register(fastifySecureSession, {
    key: authConfig().sessionKey,
    cookieName: 'marsa_session',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })

  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
  })
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  )

  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0')
}

void bootstrap()
