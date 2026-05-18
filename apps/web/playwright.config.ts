// Playwright is consumed via @nuxt/test-utils (createPage), not as a standalone
// runner. This config exists so IDE plugins and ad-hoc CLI runs find defaults.
export default {
  use: {
    headless: true,
  },
}
