import type { Database, Transaction } from '#src/modules/database/drizzle.factory.js'

/** Runs the callback against a no-op tx so use-case transaction boundaries stay unit-testable. */
export function stubDatabase(): Database {
  return {
    transaction: async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> =>
      fn({} as Transaction),
  } as unknown as Database
}
