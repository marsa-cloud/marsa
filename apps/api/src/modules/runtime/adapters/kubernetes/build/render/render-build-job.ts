import type { V1Job, V1OwnerReference, V1Secret } from '@kubernetes/client-node'
import {
  BUILD_APP_LABEL,
  BUILD_NAMESPACE,
  BUILD_TTL_SECONDS,
  BUILD_UUID_LABEL,
  BUILDKIT_IMAGE,
  GIT_TOKEN_KEY,
  REGISTRY_PUSH_SECRET,
} from '#src/modules/runtime/adapters/kubernetes/build/build.constants.js'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import type { BuildRef, BuildSpec } from '#src/modules/runtime/runtime.types.js'

const HOME = '/home/user'

export function buildJobName(ref: BuildRef): string {
  return `build-${ref.build.uuid}`
}

export function gitSecretName(ref: BuildRef): string {
  return `${buildJobName(ref)}-git`
}

function contextOf(spec: BuildSpec): string {
  const subdir = spec.rootDir === '.' || spec.rootDir === '' ? '' : `:${spec.rootDir}`
  return `${spec.repoUrl}#${spec.commitSha}${subdir}`
}

export function renderBuildJob(ref: BuildRef, spec: BuildSpec): V1Job {
  const labels = { [BUILD_UUID_LABEL]: ref.build.uuid, [BUILD_APP_LABEL]: ref.app.slug }
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: buildJobName(ref), namespace: BUILD_NAMESPACE, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: BUILD_DEADLINE_SECONDS,
      ttlSecondsAfterFinished: BUILD_TTL_SECONDS,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          containers: [
            {
              name: 'buildkit',
              image: BUILDKIT_IMAGE,
              command: ['buildctl-daemonless.sh'],
              args: [
                'build',
                '--frontend=dockerfile.v0',
                `--opt=context=${contextOf(spec)}`,
                `--opt=filename=${spec.dockerfilePath}`,
                '--secret=id=GIT_AUTH_TOKEN.github.com,env=GIT_TOKEN',
                `--output=type=image,name=${spec.pushRef},push=true,registry.insecure=true`,
              ],
              env: [
                { name: 'BUILDKITD_FLAGS', value: '--oci-worker-no-process-sandbox' },
                { name: 'DOCKER_CONFIG', value: `${HOME}/.docker` },
                {
                  name: 'GIT_TOKEN',
                  valueFrom: { secretKeyRef: { name: gitSecretName(ref), key: GIT_TOKEN_KEY } },
                },
              ],
              terminationMessagePolicy: 'FallbackToLogsOnError',
              securityContext: {
                runAsUser: 1000,
                runAsGroup: 1000,
                seccompProfile: { type: 'Unconfined' },
                appArmorProfile: { type: 'Unconfined' },
              },
              volumeMounts: [
                { name: 'docker-config', mountPath: `${HOME}/.docker` },
                { name: 'buildkitd', mountPath: `${HOME}/.local/share/buildkit` },
              ],
            },
          ],
          volumes: [
            {
              name: 'docker-config',
              secret: {
                secretName: REGISTRY_PUSH_SECRET,
                items: [{ key: '.dockerconfigjson', path: 'config.json' }],
              },
            },
            { name: 'buildkitd', emptyDir: {} },
          ],
        },
      },
    },
  }
}

export function renderGitSecret(ref: BuildRef, spec: BuildSpec, owner: V1OwnerReference): V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: gitSecretName(ref), namespace: BUILD_NAMESPACE, ownerReferences: [owner] },
    type: 'Opaque',
    stringData: { [GIT_TOKEN_KEY]: spec.gitToken },
  }
}
