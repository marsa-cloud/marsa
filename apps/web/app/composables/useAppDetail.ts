import type {
  GetAppHealthResponse,
  GetAppRunLogsResponse,
  ListAppReleasesResponse,
} from '~/api/types.gen'
import {
  zGetAppHealthResponse,
  zGetAppRunLogsResponse,
  zListAppReleasesResponse,
} from '~/api/zod.gen'

/**
 * Read composables for the per-app detail view (#129). All three are reactive
 * reads (method #1): `useAsyncData` + `$api`, with the generated Zod schema
 * validating the response in the `transform` hook at the boundary. Backends:
 * #100 (releases/health) and #105/#114 (logs).
 */

/** Release history + per-release deploy status for an app. */
export function useAppReleases(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ListAppReleasesResponse>(
    `app-releases-${slug}`,
    () => $api(`/v1/deployments/apps/${slug}/releases`),
    { transform: (raw): ListAppReleasesResponse => zListAppReleasesResponse.parse(raw) },
  )
}

/** Live runtime health of an app (never stored server-side). */
export function useAppHealth(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<GetAppHealthResponse>(
    `app-health-${slug}`,
    () => $api(`/v1/deployments/apps/${slug}/health`),
    { transform: (raw): GetAppHealthResponse => zGetAppHealthResponse.parse(raw) },
  )
}

/** A recent run-log snapshot from the app's newest pod. */
export function useAppRunLogs(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<GetAppRunLogsResponse>(
    `app-logs-${slug}`,
    () => $api(`/v1/deployments/apps/${slug}/logs`),
    { transform: (raw): GetAppRunLogsResponse => zGetAppRunLogsResponse.parse(raw) },
  )
}
