import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createStubInstance } from 'sinon'
import { DEFAULT_TAIL_LINES } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.constants.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import type { RunLogs } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function build(result: RunLogs | null) {
  const deployBackend = createStubInstance(MockDeployBackend)
  deployBackend.readRunLogs.resolves(result)
  return { usecase: new ViewAppLogsUseCase(deployBackend), deployBackend }
}

describe('ViewAppLogsUseCase', () => {
  before(() => TestBench.setupUnitTest())

  it('maps a backend snapshot to the response', async () => {
    const { usecase } = build({ podName: 'my-app-abc', logs: 'line 1\nline 2\n' })

    const result = await usecase.execute('my-app', 50)

    expect(result.podName).toBe('my-app-abc')
    expect(result.logs).toBe('line 1\nline 2\n')
  })

  it('passes the requested tailLines through to the backend', async () => {
    const { usecase, deployBackend } = build({ podName: 'p', logs: '' })

    await usecase.execute('my-app', 50)

    expect(deployBackend.readRunLogs.calledOnce).toBe(true)
    expect(deployBackend.readRunLogs.firstCall.args).toEqual([
      OPERATOR_APPS_NAMESPACE,
      'my-app',
      { tailLines: 50 },
    ])
  })

  it('defaults tailLines when the caller omits it', async () => {
    const { usecase, deployBackend } = build({ podName: 'p', logs: '' })

    await usecase.execute('my-app')

    expect(deployBackend.readRunLogs.firstCall.args[2]).toEqual({ tailLines: DEFAULT_TAIL_LINES })
  })

  it('returns an empty, null-pod snapshot when the backend finds no pod', async () => {
    const { usecase } = build(null)

    const result = await usecase.execute('missing-app')

    expect(result.podName).toBeNull()
    expect(result.logs).toBe('')
  })
})
