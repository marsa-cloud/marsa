const SLUG_MAX_LENGTH = 63
const NUMERIC_FALLBACK_PREFIX = 'app-'

// Always a DNS-1035 label (what the create form accepts), or '' when nothing usable is left.
export function repoSlug(fullName: string): string {
  const name = fullName.split('/').pop() ?? ''
  const hyphenated = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!hyphenated) return ''

  const fromFirstLetter = hyphenated.replace(/^[^a-z]+/, '')
  const slug = fromFirstLetter || `${NUMERIC_FALLBACK_PREFIX}${hyphenated}`
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '')
}
