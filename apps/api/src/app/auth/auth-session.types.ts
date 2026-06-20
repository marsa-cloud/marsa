import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'

/**
 * Augments `@fastify/secure-session`'s `SessionData` so `request.session.get/set`
 * are typed for the fields this app's session carries (#62).
 */
declare module '@fastify/secure-session' {
  interface SessionData {
    userUuid: UserUuid
    /** CSRF state bound at begin-login, consumed (set to `undefined`) at complete-login. */
    oauthState: OAuthStateUuid | undefined
  }
}
