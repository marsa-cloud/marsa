import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { BuildSpec } from '#src/modules/runtime/runtime.types.js'

export function buildSpecOf(
  source: AppSource,
  commitSha: string,
  gitToken: string,
  pushRef: string,
): BuildSpec {
  return {
    repoUrl: `https://github.com/${source.repo}.git`,
    commitSha,
    rootDir: source.rootDir,
    dockerfilePath: source.dockerfilePath,
    gitToken,
    pushRef,
  }
}
