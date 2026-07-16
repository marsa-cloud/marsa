import fastifySecureSession from '@fastify/secure-session'
import { MikroORM } from '@mikro-orm/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import Fastify from 'fastify'

import { AppModule } from '#src/app.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { DEFAULT_AUTH_COOKIE_NAME } from '#src/config/env.config.js'
import { parseSeedDevArgs } from '#src/entrypoints/seed-dev.args.js'

/**
 * Seed a dev operator + sample apps and print a ready-to-paste
 * `@fastify/secure-session` cookie, so you can click through the web UI locally
 * with NO k3d/k3s cluster and NO real GitHub login. Idempotent. Dev tooling only —
 * the request path never imports this. Usage lives in the root `.claude/CLAUDE.md`
 * ("Running the FE locally without a cluster").
 */

const DEV_GITHUB_USER_ID = '424242'
const DEV_GITHUB_LOGIN = 'marsa-dev'
const SAMPLE_APP_SLUGS = ['todos', 'blog']

async function mintSessionCookie(
  cookieName: string,
  secretKey: string,
  userUuid: string,
): Promise<string> {
  // Register the same plugin + key the running API uses, so the cookie is valid
  // against any API process configured with this AUTH_SESSION_SECRET_KEY.
  const app = Fastify()
  await app.register(fastifySecureSession, {
    key: secretKey,
    cookieName,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax' },
  })
  await app.ready()

  const encoded = app.encodeSecureSession(app.createSecureSession({ userUuid }))
  await app.close()

  // The encoded value contains a literal `;` (ciphertext;nonce). `@fastify/cookie`
  // URL-encodes cookie values, so emit the percent-encoded form for a verbatim paste.
  return `${cookieName}=${encodeURIComponent(encoded)}`
}

async function rawDogFe(): Promise<void> {
  const { userOnly } = parseSeedDevArgs(process.argv.slice(2))

  const context = await NestFactory.createApplicationContext(AppModule.forRoot([]), {
    logger: ['error', 'warn'],
  })

  try {
    const orm = context.get(MikroORM)
    await orm.migrator.up()

    const em = orm.em.fork()

    let user = await em.findOne(User, { githubUserId: DEV_GITHUB_USER_ID })
    if (!user) {
      user = new UserBuilder()
        .withGithubUserId(DEV_GITHUB_USER_ID)
        .withGithubLogin(DEV_GITHUB_LOGIN)
        .withRole(UserRole.Operator)
        .build()
      em.persist(user)
    }

    if (!userOnly) {
      for (const slug of SAMPLE_APP_SLUGS) {
        if (await em.findOne(App, { slug })) {
          continue
        }
        const app = new AppBuilder()
          .withSlug(slug)
          .withImage('nginx:1.27')
          .withContainerPort(80)
          .build()
        em.persist(app)
        em.persist(
          new ReleaseBuilder()
            .withApp(app)
            .withImageRef('nginx:1.27')
            .withDeployStatus(DeployStatus.Succeeded)
            .build(),
        )
      }
    }

    await em.flush()

    const config = context.get(ConfigService)
    const cookie = await mintSessionCookie(
      config.get<string>('AUTH_COOKIE_NAME', DEFAULT_AUTH_COOKIE_NAME),
      config.getOrThrow<string>('AUTH_SESSION_SECRET_KEY'),
      user.uuid,
    )

    console.log(`\nSeeded @${user.githubLogin} + ${SAMPLE_APP_SLUGS.length} sample apps.`)
    console.log(
      'Set this cookie for the web origin (DevTools → Application → Cookies), then reload:\n',
    )
    console.log(`  ${cookie}\n`)
  } finally {
    await context.close()
  }
}

rawDogFe().catch((error) => {
  Logger.error('raw-dog-fe failed', error)
  process.exitCode = 1
})
