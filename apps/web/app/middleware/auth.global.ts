export default defineNuxtRouteMiddleware(async (to) => {
  const { data: user, error } = await useCurrentUser()

  // `/setup` is public so a first-run operator can reach the GitHub-App
  // provisioning wizard before any account (and any login) can exist.
  const isAuthRoute
    = to.path === '/login' || to.path.startsWith('/auth/') || to.path.startsWith('/setup/')

  if (error.value && !isAuthRoute) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Unable to verify session',
      fatal: true,
    })
  }

  if (!isAuthRoute && !user.value) {
    return navigateTo('/login')
  }

  if (to.path === '/login' && user.value) {
    return navigateTo('/')
  }
})
