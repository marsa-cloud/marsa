import type { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'

export type BuildOutcome =
  | { status: BuildStatus.Succeeded; imageRef: string }
  | { status: BuildStatus.Failed; failureReason: string }
