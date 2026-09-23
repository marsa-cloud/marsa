import { describe, it } from 'node:test'
import { expect } from 'expect'
import {
  databaseNameOf,
  generateCredentials,
} from '#src/app/database/entities/database-credentials.js'

describe('generateCredentials', () => {
  it('issues the superuser role so CREATE EXTENSION works out of the box', () => {
    expect(generateCredentials('orders').user).toBe('postgres')
  })

  it('names the database after the slug, with hyphens made SQL-safe', () => {
    expect(databaseNameOf('my-orders-db')).toBe('my_orders_db')
    expect(generateCredentials('my-orders-db').database).toBe('my_orders_db')
  })

  it('generates a 64-character hex password so DATABASE_URL needs no escaping', () => {
    const { password } = generateCredentials('orders')

    expect(password).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never repeats a password', () => {
    expect(generateCredentials('orders').password).not.toBe(generateCredentials('orders').password)
  })
})
