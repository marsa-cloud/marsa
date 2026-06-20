import type { Uuid } from '#src/utils/uuid.js'

/**
 * Augments `@fastify/secure-session`'s `SessionData` so `request.session.get/set`
 * are typed for the fields this app's session carries (#62).
 */
declare module '@fastify/secure-session' {
  interface SessionData {
    userUuid: Uuid
    /** CSRF state bound at begin-login, consumed (set to `undefined`) at complete-login. */
    oauthState: string | undefined
  }
}
