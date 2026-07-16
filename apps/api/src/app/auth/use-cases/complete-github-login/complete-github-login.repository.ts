import type { EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'
import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@Injectable()
export class CompleteGithubLoginRepository {
  constructor(
    @InjectRepository(GitHubApp) private readonly apps: EntityRepository<GitHubApp>,
    @InjectRepository(OAuthState) private readonly states: EntityRepository<OAuthState>,
    @InjectRepository(User) private readonly users: EntityRepository<User>,
  ) {}

  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const [app] = await this.apps.find({}, { orderBy: { createdAt: 'DESC' }, limit: 1 })
    return app ?? null
  }

  async consumeState(state: OAuthStateUuid): Promise<boolean> {
    const deleted = await this.states.nativeDelete({ uuid: state, expiresAt: { $gt: new Date() } })
    return deleted === 1
  }

  async countUsers(): Promise<number> {
    return this.users.count()
  }

  async upsertUser(githubUserId: string, githubLogin: string, role: UserRole): Promise<User> {
    const user = new UserBuilder()
      .withGithubUserId(githubUserId)
      .withGithubLogin(githubLogin)
      .withRole(role)
      .build()

    // role/createdAt are insert-only — excluding them on conflict stops a
    // returning user from being demoted to the role computed for this login.
    return this.users.upsert(user, {
      onConflictFields: ['githubUserId'],
      onConflictExcludeFields: ['uuid', 'role', 'createdAt'],
    })
  }
}
