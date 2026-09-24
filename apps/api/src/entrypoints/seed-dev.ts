import fastifySecureSession from '@fastify/secure-session'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { and, eq } from 'drizzle-orm'
import Fastify from 'fastify'
import { AppModule } from '#src/app.module.js'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import {
  type GitHubInstallation,
  githubInstallationTable,
} from '#src/app/github-app/entities/github-installation.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { userTable } from '#src/app/user/entities/user.table.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { DEFAULT_AUTH_COOKIE_NAME } from '#src/config/env.config.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { DATABASE } from '#src/modules/database/database.tokens.js'
import { type Database, MIGRATIONS_FOLDER } from '#src/modules/database/drizzle.factory.js'
import { migrate } from '#src/modules/database/migrate.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'

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
const DEV_GITHUB_APP_ID = '4242424'
const SOURCE_APP_SLUG = 'hello'

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

// The api's mock GitHub client lists repos for any installation, so a row is all the picker needs.
async function seedGithubInstallation(
  db: Database,
  cipher: SecretCipherService,
): Promise<GitHubInstallation> {
  const [existing] = await db
    .select()
    .from(githubInstallationTable)
    .where(eq(githubInstallationTable.installationId, DEV_GITHUB_APP_ID))
    .limit(1)
  if (existing) {
    return existing
  }
  const githubApp = new GitHubAppBuilder()
    .withGithubAppId(DEV_GITHUB_APP_ID)
    .withSlug('marsa-dev')
    .withName('marsa-dev')
    .withClientSecretEnc(cipher.encrypt('dev-client-secret'))
    .withWebhookSecretEnc(cipher.encrypt('dev-webhook-secret'))
    .withPrivateKeyPemEnc(cipher.encrypt('dev-private-key'))
    .build()
  const installation = new GitHubInstallationBuilder()
    .withInstallationId(DEV_GITHUB_APP_ID)
    .withAccountLogin('marsa-mock')
    .withAppUuid(githubApp.uuid)
    .build()
  await db.insert(githubAppTable).values(githubApp)
  await db.insert(githubInstallationTable).values(installation)
  return installation
}

async function seedSourceApp(
  db: Database,
  environment: Environment,
  installation: GitHubInstallation,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, SOURCE_APP_SLUG))
      .limit(1)
    if (existing) {
      return
    }
    const imageRef = `registry.mock.test/${SOURCE_APP_SLUG}:${MOCK_COMMIT_SHA}`
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SOURCE_APP_SLUG)
      .withImage(imageRef)
      .withContainerPort(8080)
      .withSource({
        type: 'github',
        installationUuid: installation.uuid,
        repo: 'marsa-mock/hello',
        branch: 'main',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      })
      .build()
    const build = new BuildBuilder()
      .withApp(app)
      .withCommitSha(MOCK_COMMIT_SHA)
      .withTrigger(BuildTrigger.Create)
      .withStatus(BuildStatus.Succeeded)
      .withImageRef(imageRef)
      .build()
    const release = new ReleaseBuilder()
      .withApp(app)
      .withBuildUuid(build.uuid)
      .withDeployStatus(DeployStatus.Succeeded)
      .build()
    await tx.insert(appTable).values(app)
    await tx.insert(buildTable).values(build)
    await tx.insert(releaseTable).values(release)
  })
}

async function rawDogFe(): Promise<void> {
  const userOnly = process.argv.includes('--user-only')

  const context = await NestFactory.createApplicationContext(AppModule.forRoot([]), {
    logger: ['error', 'warn'],
  })

  try {
    const db = context.get<Database>(DATABASE)
    await migrate(db, MIGRATIONS_FOLDER)

    let [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.githubUserId, DEV_GITHUB_USER_ID))
      .limit(1)
    if (!user) {
      user = new UserBuilder()
        .withGithubUserId(DEV_GITHUB_USER_ID)
        .withGithubLogin(DEV_GITHUB_LOGIN)
        .withRole(UserRole.Operator)
        .build()
      await db.insert(userTable).values(user)
    }

    if (!userOnly) {
      let [project] = await db.select().from(projectTable).where(eq(projectTable.slug, 'dev'))
      if (!project) {
        project = new ProjectBuilder().withName('Dev').withSlug('dev').build()
        await db.insert(projectTable).values(project)
      }
      let [environment] = await db
        .select()
        .from(environmentTable)
        .where(
          and(
            eq(environmentTable.projectUuid, project.uuid),
            eq(environmentTable.slug, 'production'),
          ),
        )
      if (!environment) {
        environment = new EnvironmentBuilder().withProject(project).build()
        await db.insert(environmentTable).values(environment)
      }

      for (const slug of SAMPLE_APP_SLUGS) {
        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(appTable)
            .where(eq(appTable.slug, slug))
            .limit(1)
          if (existing) {
            return
          }
          const app = new AppBuilder()
            .withEnvironmentUuid(environment.uuid)
            .withSlug(slug)
            .withImage('nginx:1.27')
            .withContainerPort(80)
            .build()
          const release = new ReleaseBuilder()
            .withApp(app)
            .withImageRef('nginx:1.27')
            .withDeployStatus(DeployStatus.Succeeded)
            .build()
          await tx.insert(appTable).values(app)
          await tx.insert(releaseTable).values(release)
        })
      }

      const installation = await seedGithubInstallation(db, context.get(SecretCipherService))
      await seedSourceApp(db, environment, installation)
    }

    const config = context.get(ConfigService)
    const cookie = await mintSessionCookie(
      config.get<string>('AUTH_COOKIE_NAME', DEFAULT_AUTH_COOKIE_NAME),
      config.getOrThrow<string>('AUTH_SESSION_SECRET_KEY'),
      user.uuid,
    )

    console.log(
      `\nSeeded @${user.githubLogin}${userOnly ? '' : ` + ${SAMPLE_APP_SLUGS.length} sample apps, a GitHub installation and the '${SOURCE_APP_SLUG}' source app`}.`,
    )
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
