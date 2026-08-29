import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from '#src/app/auth/guards/roles.guard.js'
import { UserRoleModule } from '#src/app/auth/services/user-role/user-role.module.js'

// Imported by AppModule.forRoot rather than AuthModule so it also covers
// setupModuleTest, which boots one feature without AuthModule.
@Module({
  imports: [UserRoleModule],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AccessControlModule {}
