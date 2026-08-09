import type {
  ReleaseSummary,
  ViewAppDetailResponse,
  ViewAppHealthResponse,
  ViewAppLogsResponse,
  ViewReleaseIndexQueryKey,
} from '~/api/types.gen'
import {
  zViewAppDetailResponse,
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

/**
 * Release history + per-release deploy status for an app. Accumulating rather
 * than a single-shot read (#185): history grows with every deploy, so it is
 * paginated. Only the first page carries `failureReason` — the API reconciles
 * deploy status head-only, and the head only exists on page one.
 */
export function useAppReleases(slug: string) {
  return useKeysetList<ReleaseSummary, ViewReleaseIndexQueryKey>(
    `/v1/apps/${encodeURIComponent(slug)}/releases`,
    raw => zViewReleaseIndexResponse.parse(raw),
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

/** Stored config for one app — the source of truth for the env editor. */
export function useAppDetail(slug: string) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppDetailResponse>(
    `app-detail-${slug}`,
    () => $api(`/v1/apps/${encodeURIComponent(slug)}`),
    { transform: (raw): ViewAppDetailResponse => zViewAppDetailResponse.parse(raw) },
  )
}

/**
 * A recent run-log snapshot from the app's newest pod. `tailLines` is a ref
 * because `watch` is what re-fetches when the page's selector changes it — the
 * cache key is per-slug only, so dropping the watch would freeze the pane at
 * whatever line count loaded first.
 */
export function useAppRunLogs(slug: string, tailLines: Ref<number>) {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewAppLogsResponse>(
    `app-logs-${slug}`,
    () =>
      $api(`/v1/apps/${encodeURIComponent(slug)}/logs`, {
        query: { tailLines: tailLines.value },
      }),
    {
      watch: [tailLines],
      transform: (raw): ViewAppLogsResponse => zViewAppLogsResponse.parse(raw),
    },
  )
}
