/** Removes one or more trailing slashes from a URL or path string. */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}
