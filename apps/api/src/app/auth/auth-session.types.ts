/**
 * Augments `@fastify/secure-session`'s `SessionData` so `request.session.get/set`
 * are typed for the one field this app's session carries (#62).
 */
declare module '@fastify/secure-session' {
  interface SessionData {
    operatorUuid: string
  }
}
