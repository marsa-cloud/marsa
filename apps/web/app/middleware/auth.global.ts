export default defineNuxtRouteMiddleware(async (to) => {
  const { data: user } = await useCurrentUser()

  const isAuthRoute = to.path === '/login' || to.path.startsWith('/auth/')

  if (!isAuthRoute && !user.value) {
    return navigateTo('/login')
  }

  if (to.path === '/login' && user.value) {
    return navigateTo('/')
  }
})
