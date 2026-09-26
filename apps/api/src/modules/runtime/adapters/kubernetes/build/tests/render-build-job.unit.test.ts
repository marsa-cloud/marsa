import { describe, it } from 'node:test'
import { expect } from 'expect'
import {
  buildJobName,
  renderBuildJob,
  renderGitSecret,
} from '#src/modules/runtime/adapters/kubernetes/build/render/render-build-job.js'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import type { BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

const UUID = '0190f0f0-0000-7000-8000-000000000001' as Uuid<'Build'>
const SHA = 'b'.repeat(40)
const ref: BuildRef = { build: { uuid: UUID }, app: { slug: 'shop' } }
const spec: BuildSpec = {
  repoUrl: 'https://github.com/acme/shop.git',
  commitSha: SHA,
  rootDir: 'apps/api',
  dockerfilePath: 'Dockerfile',
  gitToken: 'ghs_x',
  pushRef: `marsa-registry.marsa.svc.cluster.local:5000/shop:${SHA}`,
}

describe('renderBuildJob', () => {
  const job = renderBuildJob(ref, spec)
  const container = job.spec?.template.spec?.containers[0]

  it('names and labels the job after the build', () => {
    expect(job.metadata?.name).toBe(`build-${UUID}`)
    expect(job.metadata?.namespace).toBe('marsa-builds')
    expect(job.spec?.template.metadata?.labels).toMatchObject({
      'marsa.cloud/build-uuid': UUID,
      'marsa.cloud/app': 'shop',
    })
  })

  it('builds the pinned commit and root directory and pushes over plain http', () => {
    expect(container?.args).toEqual([
      'build',
      '--frontend=dockerfile.v0',
      `--opt=context=https://github.com/acme/shop.git#${SHA}:apps/api`,
      '--opt=filename=Dockerfile',
      '--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN',
      `--output=type=image,name=${spec.pushRef},push=true,registry.insecure=true`,
    ])
  })

  it('omits the subdirectory for a repo-root build', () => {
    const root = renderBuildJob(ref, { ...spec, rootDir: '.' })

    expect(root.spec?.template.spec?.containers[0]?.args).toContain(
      `--opt=context=https://github.com/acme/shop.git#${SHA}`,
    )
  })

  it('runs rootless with the relaxed profiles BuildKit needs', () => {
    expect(container?.securityContext).toEqual({
      runAsUser: 1000,
      runAsGroup: 1000,
      seccompProfile: { type: 'Unconfined' },
      appArmorProfile: { type: 'Unconfined' },
    })
    expect(container?.env).toContainEqual({
      name: 'BUILDKITD_FLAGS',
      value: '--oci-worker-no-process-sandbox',
    })
  })

  it('reads the git token from the per-build secret and never inlines it', () => {
    expect(container?.env).toContainEqual({
      name: 'GIT_TOKEN',
      valueFrom: { secretKeyRef: { name: `build-${UUID}-git`, key: 'token' } },
    })
    expect(JSON.stringify(job)).not.toContain('ghs_x')
  })

  it('fails once, within the deadline, keeps logs an hour and reports errors', () => {
    expect(job.spec?.backoffLimit).toBe(0)
    expect(job.spec?.activeDeadlineSeconds).toBe(BUILD_DEADLINE_SECONDS)
    expect(job.spec?.ttlSecondsAfterFinished).toBe(3600)
    expect(container?.terminationMessagePolicy).toBe('FallbackToLogsOnError')
  })
})

describe('renderGitSecret', () => {
  it('is owned by the job so it is deleted with it', () => {
    const owner = { apiVersion: 'batch/v1', kind: 'Job', name: buildJobName(ref), uid: 'u-1' }
    const secret = renderGitSecret(ref, spec, owner)

    expect(secret.metadata?.name).toBe(`build-${UUID}-git`)
    expect(secret.metadata?.ownerReferences).toEqual([owner])
    expect(secret.stringData).toEqual({ token: 'ghs_x' })
  })
})
