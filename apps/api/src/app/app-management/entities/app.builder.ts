import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Fluent builder for {@link App}; constructor seeds valid defaults so `new AppBuilder().build()` is always usable. */
export class AppBuilder {
  private readonly app: App

  constructor() {
    const now = new Date()
    this.app = {
      uuid: generateUuid<AppUuid>(),
      slug: 'my-app',
      domain: { type: 'subdomain' },
      image: 'nginx:1.27',
      containerPort: 80,
      replicas: 1,
      env: {},
      imagePullCredentialsEnc: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withSlug(slug: string): this {
    this.app.slug = slug
    return this
  }

  withDomain(domain: AppDomain): this {
    this.app.domain = domain
    return this
  }

  withImage(image: string): this {
    this.app.image = image
    return this
  }

  withContainerPort(containerPort: number): this {
    this.app.containerPort = containerPort
    return this
  }

  withReplicas(replicas: number): this {
    this.app.replicas = replicas
    return this
  }

  withEnv(env: Record<string, string>): this {
    this.app.env = env
    return this
  }

  withImagePullCredentialsEnc(imagePullCredentialsEnc: string | null): this {
    this.app.imagePullCredentialsEnc = imagePullCredentialsEnc
    return this
  }

  build(): App {
    return this.app
  }
}
