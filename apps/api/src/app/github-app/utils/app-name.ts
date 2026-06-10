/** Derives a GitHub App name from the install's web URL — globally unique, capped at 34 chars. */
export function appName(webUrl: string): string {
  const host = webUrl
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `marsa-${host}`.slice(0, 34).replace(/-+$/g, '')
}
