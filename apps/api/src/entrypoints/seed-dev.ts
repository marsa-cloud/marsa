import fastifySecureSession from '@fastify/secure-session'
import { MikroORM } from '@mikro-orm/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { eq } from 'drizzle-orm'
import Fastify from 'fastify'
import { AppModule } from '#src/app.module.js'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { appTable } from '#src/app/deployments/entities/app.table.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { releaseTable } from '#src/app/deployments/entities/release.table.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { DEFAULT_AUTH_COOKIE_NAME } from '#src/config/env.config.js'
import { DATABASE } from '#src/modules/database/database.tokens.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'

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
  const context = await NestFactory.createApplicationContext(AppModule.forRoot([]), {
    logger: ['error', 'warn'],
  })

  try {
    const orm = context.get(MikroORM)
    await orm.migrator.up()

    const em = orm.em.fork()
    const db = context.get<Database>(DATABASE)

    let user = await em.findOne(User, { githubUserId: DEV_GITHUB_USER_ID })
    if (!user) {
      user = new UserBuilder()
        .withGithubUserId(DEV_GITHUB_USER_ID)
        .withGithubLogin(DEV_GITHUB_LOGIN)
        .withRole(UserRole.Operator)
        .build()
      await em.persistAndFlush(user)
    }

    for (const slug of SAMPLE_APP_SLUGS) {
      const [existing] = await db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
      if (existing) {
        continue
      }
      const app = new AppBuilder()
        .withSlug(slug)
        .withImage('nginx:1.27')
        .withContainerPort(80)
        .build()
      const release = new ReleaseBuilder()
        .withApp(app)
        .withImageRef('nginx:1.27')
        .withDeployStatus(DeployStatus.Succeeded)
        .build()
      await db.insert(appTable).values(app)
      await db.insert(releaseTable).values(release)
    }

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
