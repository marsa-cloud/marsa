import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { selectDeployBackend } from '#src/modules/kubernetes/deploy-backend.selector.js'

describe('selectDeployBackend', () => {
  it('defaults to mock under test when DEPLOY_BACKEND unset', () => {
    strictEqual(selectDeployBackend(undefined, 'test'), 'mock')
  })
  it('defaults to direct outside test when DEPLOY_BACKEND unset', () => {
    strictEqual(selectDeployBackend(undefined, 'production'), 'direct')
  })
  it('honors explicit direct even under NODE_ENV=test', () => {
    strictEqual(selectDeployBackend('direct', 'test'), 'direct')
  })
  it('honors explicit mock even in production', () => {
    strictEqual(selectDeployBackend('mock', 'production'), 'mock')
  })
})
