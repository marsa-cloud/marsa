import { describe, it } from 'node:test'
import { expect } from 'expect'
import { deriveOperationId, operationIdFactory } from '#src/modules/swagger/operation-id-factory.js'

describe('deriveOperationId', () => {
  it('strips the Controller suffix, camel-cases, and appends the capitalised version', () => {
    expect(deriveOperationId('GetApiInfoController', 'v1')).toBe('getApiInfoV1')
    expect(deriveOperationId('DeployAppController', 'v1')).toBe('deployAppV1')
    expect(deriveOperationId('GetCurrentUserController', 'v1')).toBe('getCurrentUserV1')
  })

  it('derives github-app operation ids from the class name (option C: no context injection)', () => {
    expect(deriveOperationId('GetManifestController', 'v1')).toBe('getManifestV1')
    expect(deriveOperationId('ConvertManifestController', 'v1')).toBe('convertManifestV1')
    expect(deriveOperationId('CaptureInstallationController', 'v1')).toBe('captureInstallationV1')
  })

  it('omits the suffix when no version is supplied', () => {
    expect(deriveOperationId('GetApiInfoController')).toBe('getApiInfo')
    expect(deriveOperationId('GetApiInfoController', undefined)).toBe('getApiInfo')
  })

  it('handles a class name that is exactly "Controller"', () => {
    expect(deriveOperationId('Controller', 'v1')).toBe('Controller')
  })
})

describe('operationIdFactory', () => {
  it('ignores the method key and derives from the controller key + version', () => {
    expect(operationIdFactory('GetApiInfoController', 'handle', 'v1')).toBe('getApiInfoV1')
  })
})
