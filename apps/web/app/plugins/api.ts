export default defineNuxtPlugin(() => {
  const { apiBase } = useRuntimeConfig().public

  const api = $fetch.create({
    baseURL: apiBase,
    onResponseError({ response }) {
      console.error(`API request failed: ${response.status} ${response.url}`)
    },
  })

  return {
    provide: { api },
  }
})
