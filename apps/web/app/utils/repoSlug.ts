const SLUG_MAX_LENGTH = 63

export function repoSlug(fullName: string): string {
  const name = fullName.split('/').pop() ?? ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '')
}
