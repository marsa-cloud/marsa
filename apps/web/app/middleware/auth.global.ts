export default defineNuxtRouteMiddleware(async (to) => {
  const { data: user, error } = await useCurrentUser()

  const isAuthRoute = to.path === '/login' || to.path.startsWith('/auth/')

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
