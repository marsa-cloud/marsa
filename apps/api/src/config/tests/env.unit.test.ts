import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { DEFAULT_AUTH_COOKIE_NAME, envValidationSchema } from '#src/config/env.config.js'
import { TestBench } from '#src/test/setup/test-bench.js'

// Fake value (base64 of repeated "*"), only ever fed to the schema's shape check below — never decrypted or used to sign anything.
const FAKE_BASE64_PLACEHOLDER = 'KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio='

const REGISTRY_ENV = {
  MARSA_REGISTRY_HOST: 'registry.demo.marsa.cc',
  MARSA_REGISTRY_URL: 'http://marsa-registry:5000',
  MARSA_REGISTRY_PUSH_PASSWORD: 'push',
  MARSA_REGISTRY_PULL_PASSWORD: 'pull',
}

const VALID_ENV = {
  DATABASE_URL: 'postgresql://marsa:marsa@localhost:5432',
  DB_NAME: 'marsa_test',
  APP_SECRETS_ENCRYPTION_KEY: FAKE_BASE64_PLACEHOLDER,
  AUTH_SESSION_SECRET_KEY: FAKE_BASE64_PLACEHOLDER,
  MARSA_WEB_URL: 'https://demo.marsa.cc',
  MARSA_API_PUBLIC_URL: 'https://api.demo.marsa.cc',
  MARSA_BASE_DOMAIN: 'demo.marsa.cc',
  ...REGISTRY_ENV,
}

describe('envValidationSchema', () => {
  before(() => TestBench.setupUnitTest())

  it('accepts a valid env, applying defaults for optional vars', () => {
    const { error, value } = envValidationSchema.validate(VALID_ENV)

    expect(error).toBeUndefined()
    expect(value.NODE_ENV).toBe('development')
    expect(value.PORT).toBe(3000)
    expect(value.VERSION).toBe('0.0.0')
    expect(value.AUTH_COOKIE_NAME).toBe(DEFAULT_AUTH_COOKIE_NAME)
  })

  it('rejects an env missing a required var', () => {
    const rest: Partial<typeof VALID_ENV> = { ...VALID_ENV }
    delete rest.DATABASE_URL

    const { error } = envValidationSchema.validate(rest)

    expect(error?.message).toMatch(/DATABASE_URL/)
  })

  it('rejects a malformed NODE_ENV', () => {
    const { error } = envValidationSchema.validate({ ...VALID_ENV, NODE_ENV: 'staging' })

    expect(error?.message).toMatch(/NODE_ENV/)
  })

  it('rejects a non-URI MARSA_WEB_URL', () => {
    const { error } = envValidationSchema.validate({ ...VALID_ENV, MARSA_WEB_URL: 'not-a-url' })

    expect(error?.message).toMatch(/MARSA_WEB_URL/)
  })

  it('rejects a non-hostname MARSA_BASE_DOMAIN', () => {
    const { error } = envValidationSchema.validate({
      ...VALID_ENV,
      MARSA_BASE_DOMAIN: 'https://demo.marsa.cc',
    })

    expect(error?.message).toMatch(/MARSA_BASE_DOMAIN/)
  })

  it('requires the registry settings on the default kubernetes runtime', () => {
    const rest: Partial<typeof VALID_ENV> = { ...VALID_ENV }
    delete rest.MARSA_REGISTRY_HOST

    const { error } = envValidationSchema.validate(rest)

    expect(error?.message).toMatch(/MARSA_REGISTRY_HOST/)
  })

  it('does not require the registry settings on the mock runtime', () => {
    const withoutRegistry: Record<string, string> = { ...VALID_ENV, MARSA_RUNTIME: 'mock' }
    for (const key of Object.keys(REGISTRY_ENV)) {
      delete withoutRegistry[key]
    }

    const { error } = envValidationSchema.validate(withoutRegistry)

    expect(error).toBeUndefined()
  })

  it('rejects a registry host with a scheme', () => {
    const { error } = envValidationSchema.validate({
      ...VALID_ENV,
      MARSA_REGISTRY_HOST: 'https://registry.demo.marsa.cc',
    })

    expect(error?.message).toMatch(/MARSA_REGISTRY_HOST/)
  })
})
