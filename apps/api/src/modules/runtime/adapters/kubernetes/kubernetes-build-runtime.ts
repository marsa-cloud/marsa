import { BatchV1Api, CoreV1Api, KubeConfig, type V1Job, type V1Pod } from '@kubernetes/client-node'
import { Injectable } from '@nestjs/common'
import { newestPod } from '#src/modules/runtime/adapters/kubernetes/app/rollout/newest-pod.js'
import {
  BUILD_NAMESPACE,
  JOB_NAME_LABEL,
} from '#src/modules/runtime/adapters/kubernetes/build/build.constants.js'
import { mapBuildObservation } from '#src/modules/runtime/adapters/kubernetes/build/observe/map-build-observation.js'
import {
  buildJobName,
  renderBuildJob,
  renderGitSecret,
} from '#src/modules/runtime/adapters/kubernetes/build/render/render-build-job.js'
import {
  ignoreConflict,
  isConflict,
} from '#src/modules/runtime/adapters/kubernetes/shared/conflict.js'
import {
  ignoreNotFound,
  isNotFound,
} from '#src/modules/runtime/adapters/kubernetes/shared/not-found.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import {
  type BuildObservation,
  type BuildRef,
  type BuildSpec,
  BuildState,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class KubernetesBuildRuntime extends BuildRuntime {
  private readonly batch: BatchV1Api
  private readonly core: CoreV1Api

  constructor() {
    super()
    const kc = new KubeConfig()
    kc.loadFromDefault()
    this.batch = kc.makeApiClient(BatchV1Api)
    this.core = kc.makeApiClient(CoreV1Api)
  }

  async start(ref: BuildRef, spec: BuildSpec): Promise<void> {
    const job = await this.createJob(ref, spec)
    const owner = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      name: buildJobName(ref),
      uid: job.metadata?.uid ?? '',
    }
    // The pod waits on this Secret, so creating it after the Job only delays the first start.
    await ignoreConflict(() =>
      this.core.createNamespacedSecret({
        namespace: BUILD_NAMESPACE,
        body: renderGitSecret(ref, spec, owner),
      }),
    )
  }

  async cancel(ref: BuildRef): Promise<void> {
    await ignoreNotFound(() =>
      this.batch.deleteNamespacedJob({
        name: buildJobName(ref),
        namespace: BUILD_NAMESPACE,
        propagationPolicy: 'Background',
      }),
    )
  }

  async readStatus(ref: BuildRef): Promise<BuildObservation> {
    let job: V1Job
    try {
      job = await this.batch.readNamespacedJob({
        name: buildJobName(ref),
        namespace: BUILD_NAMESPACE,
      })
    } catch (error) {
      if (isNotFound(error)) {
        return { state: BuildState.NotFound }
      }
      throw error
    }
    return mapBuildObservation(job, await this.listPods(ref))
  }

  async readLogs(ref: BuildRef): Promise<string | null> {
    const name = newestPod(await this.listPods(ref))?.metadata?.name
    if (!name) {
      return null
    }
    try {
      return await this.core.readNamespacedPodLog({ name, namespace: BUILD_NAMESPACE })
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }
      throw error
    }
  }

  private async createJob(ref: BuildRef, spec: BuildSpec): Promise<V1Job> {
    try {
      return await this.batch.createNamespacedJob({
        namespace: BUILD_NAMESPACE,
        body: renderBuildJob(ref, spec),
      })
    } catch (error) {
      if (!isConflict(error)) {
        throw error
      }
      return this.batch.readNamespacedJob({ name: buildJobName(ref), namespace: BUILD_NAMESPACE })
    }
  }

  private async listPods(ref: BuildRef): Promise<V1Pod[]> {
    const { items } = await this.core.listNamespacedPod({
      namespace: BUILD_NAMESPACE,
      labelSelector: `${JOB_NAME_LABEL}=${buildJobName(ref)}`,
    })
    return items
  }
}
