import { before, describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { expect } from 'expect'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { TestBench } from '#src/test/setup/test-bench.js'

const base = { environmentUuid: '0199a1b2-0000-7000-8000-000000000000', slug: 'shop' }
const source = {
  installationUuid: '0199a1b2-0000-7000-8000-000000000001',
  repo: 'acme/shop',
  branch: 'main',
}

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAppCommand, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap((child) => Object.values(child.constraints ?? {})),
  ])
}

describe('CreateAppCommand', () => {
  before(() => TestBench.setupUnitTest())

  it('accepts an image app with a port', async () => {
    expect(await errorsOf({ ...base, image: 'nginx:1.27', containerPort: 80 })).toEqual([])
  })

  it('accepts a source app without an image or a port', async () => {
    expect(await errorsOf({ ...base, source })).toEqual([])
  })

  it('rejects both an image and a source', async () => {
    expect(await errorsOf({ ...base, image: 'nginx:1.27', containerPort: 80, source })).toContain(
      'Send exactly one of image or source.',
    )
  })

  it('rejects neither an image nor a source', async () => {
    expect(await errorsOf(base)).toContain('Send exactly one of image or source.')
  })

  it('still requires a port for an image app', async () => {
    expect((await errorsOf({ ...base, image: 'nginx:1.27' })).length).toBeGreaterThan(0)
  })

  for (const rootDir of ['/etc', '../up', 'a/../b']) {
    it(`rejects the root directory ${rootDir}`, async () => {
      expect((await errorsOf({ ...base, source: { ...source, rootDir } })).length).toBeGreaterThan(
        0,
      )
    })
  }

  it('rejects a repo that is not owner/name', async () => {
    expect(
      (await errorsOf({ ...base, source: { ...source, repo: 'acme' } })).length,
    ).toBeGreaterThan(0)
  })
})
