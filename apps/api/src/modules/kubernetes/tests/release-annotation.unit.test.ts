import { describe, it } from 'node:test'
import { expect } from 'expect'
import { InvalidReleaseAnnotationError } from '#src/modules/kubernetes/deploy-backend.js'
import { parseReleaseAnnotation } from '#src/modules/kubernetes/release-annotation.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

describe('parseReleaseAnnotation', () => {
  it('reads an absent annotation as nothing deployed', () => {
    expect(parseReleaseAnnotation(undefined, 'my-app')).toBeNull()
  })

  it('passes a uuid through', () => {
    const uuid = generateUuid<Uuid<'Release'>>()

    expect(parseReleaseAnnotation(uuid, 'my-app')).toBe(uuid)
  })

  it('throws on a malformed annotation, naming the deployment and the bad value', () => {
    expect(() => parseReleaseAnnotation('not-a-uuid', 'my-app')).toThrow(
      InvalidReleaseAnnotationError,
    )
    expect(() => parseReleaseAnnotation('not-a-uuid', 'my-app')).toThrow(
      "Deployment 'my-app' carries release annotation 'not-a-uuid', which is not a uuid.",
    )
  })

  it('treats an empty annotation as malformed rather than absent', () => {
    expect(() => parseReleaseAnnotation('', 'my-app')).toThrow(InvalidReleaseAnnotationError)
  })
})
