import type { Queue } from 'pg-boss'

export type JobQueueOptions = Pick<
  Queue,
  | 'retryLimit'
  | 'retryDelay'
  | 'retryBackoff'
  | 'retryDelayMax'
  | 'expireInSeconds'
  | 'deadLetter'
  | 'policy'
>

export abstract class Job<TPayload extends object> {
  static readonly queue: string
  static readonly options: JobQueueOptions = {}
  static readonly schedule?: string

  constructor(readonly payload: TPayload) {}
}

export type JobClass<TPayload extends object = object> = {
  new (payload: never): Job<TPayload>
  readonly queue: string
  readonly options: JobQueueOptions
  readonly schedule?: string
}
