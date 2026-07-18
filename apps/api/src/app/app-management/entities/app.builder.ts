import { App } from '#src/app/app-management/entities/app.entity.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'

/** Fluent builder for {@link App}; constructor seeds valid defaults so `new AppBuilder().build()` is always usable. */
export class AppBuilder {
  private readonly app: App

  constructor() {
    this.app = new App()
    this.app.slug = 'my-app'
    this.app.domain = { type: 'subdomain' }
    this.app.image = 'nginx:1.27'
    this.app.containerPort = 80
    this.app.replicas = 1
    this.app.env = {}
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
