// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  ssr: false,

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Override at runtime with NUXT_PUBLIC_API_BASE
      apiBase: 'http://localhost:3000/api',
      version: '0.0.0',
      commit: '',
    },
  },

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        semi: false,
        commaDangle: 'always-multiline',
        quotes: 'single',
        braceStyle: '1tbs',
      },
    },
  },
})
