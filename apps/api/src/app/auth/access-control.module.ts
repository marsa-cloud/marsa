import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from '#src/app/auth/guards/roles.guard.js'
import { UserRoleService } from '#src/app/auth/user-role.service.js'

/**
 * Registers the role gate globally (#63). Imported by `AppModule.forRoot` rather
 * than by `AuthModule`, so it covers every composition root — including
 * `setupModuleTest`, which boots a single feature without `AuthModule`.
 */
@Module({
  providers: [UserRoleService, { provide: APP_GUARD, useClass: RolesGuard }],
})
export class AccessControlModule {}
