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

  // A guest is authenticated but not approved: every other route would answer
  // 403, so send them somewhere that says so (#63).
  if (user.value?.role === 'guest' && to.path !== '/pending' && !isAuthRoute) {
    return navigateTo('/pending')
  }

  if (user.value && user.value.role !== 'guest' && to.path === '/pending') {
    return navigateTo('/')
  }

  if (to.path === '/team' && user.value?.role !== 'operator') {
    return navigateTo('/')
  }
})
