import * as z from 'zod'

// Mirrors the api's App-config validators so bad input is caught inline, not as a bare 400.
export const appConfigFields = {
  image: z.string().min(1, 'Required'),
  containerPort: z
    .number({ message: 'Required' })
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 65535')
    .lte(65535, 'Must be between 1 and 65535'),
  minReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(0, 'Must be between 0 and 100')
    .lte(100, 'Must be between 0 and 100')
    .optional(),
  maxReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 100')
    .lte(100, 'Must be between 1 and 100')
    .optional(),
}

export const isReplicaRangeValid = (d: { minReplicas?: number, maxReplicas?: number }) =>
  d.minReplicas === undefined || d.maxReplicas === undefined || d.maxReplicas >= d.minReplicas

export const REPLICA_RANGE_ERROR = { message: 'Must be at least the minimum', path: ['maxReplicas'] }
