import type {
  ViewAppHealthResponse,
  ViewAppLogsResponse,
  ViewReleaseIndexResponse,
} from '~/api/types.gen'
import {
  zViewAppHealthResponse,
  zViewAppLogsResponse,
  zViewReleaseIndexResponse,
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
  return useAsyncData<ViewReleaseIndexResponse>(
    `app-releases-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}/releases`),
    { transform: (raw): ViewReleaseIndexResponse => zViewReleaseIndexResponse.parse(raw) },
  )
}

/** Live runtime health of an app (never stored server-side). */
export function useAppHealth(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppHealthResponse>(
    `app-health-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}/health`),
    { transform: (raw): ViewAppHealthResponse => zViewAppHealthResponse.parse(raw) },
  )
}

/** A recent run-log snapshot from the app's newest pod. */
export function useAppRunLogs(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppLogsResponse>(
    `app-logs-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}/logs`),
    { transform: (raw): ViewAppLogsResponse => zViewAppLogsResponse.parse(raw) },
  )
}
