import { BadRequestException } from '@nestjs/common'

// The decoded contents of a keyset cursor: the sort key + unique tiebreaker of
// the last row on the previous page.
export interface CursorPayload {
  readonly sortValue: string | number
  readonly id: string
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new BadRequestException('Malformed pagination cursor.')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('sortValue' in parsed) ||
    !('id' in parsed) ||
    typeof (parsed as CursorPayload).id !== 'string' ||
    !['string', 'number'].includes(typeof (parsed as CursorPayload).sortValue)
  ) {
    throw new BadRequestException('Malformed pagination cursor.')
  }

  return { sortValue: (parsed as CursorPayload).sortValue, id: (parsed as CursorPayload).id }
}
