import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from '#src/app/auth/guards/roles.guard.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { UserRoleModule } from '#src/app/auth/services/user-role/user-role.module.js'

// Imported by AppModule.forRoot rather than AuthModule so it also covers setupModuleTest,
// which boots one feature without AuthModule. Order matters: APP_GUARD providers run in
// registration order, and RolesGuard assumes SessionAuthGuard has already rejected a
// sessionless request.
@Module({
  imports: [UserRoleModule],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AccessControlModule {}
