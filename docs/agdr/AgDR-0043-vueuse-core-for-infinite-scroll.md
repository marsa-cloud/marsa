---
id: AgDR-0043
timestamp: 2026-08-09T00:00:00Z
agent: claude
model: claude-opus-5
trigger: user-prompt
status: accepted
ticket: marsa-cloud/marsa#185
---

# Declare `@vueuse/core` in `apps/web` for infinite scroll

> In the context of surfacing keyset pagination as infinite scroll (#185), facing a scroll-trigger implementation that Nuxt ships no first-party primitive for, I decided to **declare `@vueuse/core` as a direct dependency of `apps/web` and use `useInfiniteScroll`**, to achieve a load trigger with the correct stop semantics without hand-maintaining an observer, accepting a new declared dependency in a package that previously had six.

## Context

Nuxt has no first-party infinite query or scroll-trigger composable. The ticket originally scoped a plain "Load more" button and deferred the scroll trigger, explicitly because `@vueuse/core` was **not** a declared dependency of `apps/web` and reaching for it on the strength of a transitive resolution is a trap.

That trap is real and worth recording: `@vueuse/core` _does_ appear in the lockfile — pulled in by `reka-ui` and `motion-v` under `@nuxt/ui`, and by devtools. Under pnpm's strict, non-hoisted `node_modules` it is nonetheless **not importable from `apps/web`**, so "it's already there" is false in the only sense that matters. Using it requires declaring it.

The choice was therefore between declaring it and hand-rolling the trigger.

## Options Considered

| Option                                                       | Pros                                                                                                                                                                                                                      | Cons                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Declare `@vueuse/core`, use `useInfiniteScroll`** (chosen) | Purpose-built: ships `canLoadMore` and `distance` and handles observer lifecycle; the de-facto standard utility library in the Vue/Nuxt ecosystem; already resolved in the lockfile, so no meaningful install-size change | One more declared dependency; a large library used for one function (tree-shakeable, so the cost is nominal)                                                                                    |
| Hand-roll `IntersectionObserver` in a local composable       | Zero new dependencies; ~15 lines; native browser API                                                                                                                                                                      | Re-implements observer lifecycle and the "don't re-fire while a load is in flight" guard, both of which the library already gets right; the second scroll-driven feature would re-litigate this |
| Button only, no scroll trigger                               | Simplest; nothing new                                                                                                                                                                                                     | Not the requested behaviour — infinite scroll was asked for explicitly                                                                                                                          |

## Decision

Chosen: **declare `@vueuse/core`** (catalog entry + `apps/web/package.json`), because the utility is ecosystem-standard, already resolved, and `useInfiniteScroll` supplies the exact semantics this needs.

Two implementation constraints came out of the library's own documentation and are load-bearing:

- **`canLoadMore` is effectively mandatory.** Without it `onLoadMore` re-fires for as long as there is room for more content, so the last page loops. It is also where the "a request is already in flight" guard belongs. The docs warn about this explicitly.
- **The observer must bind to the real scroll container.** The window never scrolls in this app: `UDashboardPanel`'s `#body` slot carries `flex-1 overflow-y-auto` and the dashboard root is `fixed inset-0 overflow-hidden`. `InfiniteScrollFooter` resolves the container by walking up from its own element to the first ancestor with `overflow-y: auto | scroll`, rather than by a marker class, so it survives changes to the panel's internals.

A visible, focusable **"Load more" button is kept** alongside the sentinel. Scroll-only loading strands keyboard and screen-reader users at the end of the first page; the button is the accessible control and the sentinel is the enhancement.

## Consequences

- `apps/web` gains a direct dependency on `@vueuse/core` (catalog-pinned, like everything else).
- Future scroll/visibility/sensor needs have an obvious home instead of accreting hand-rolled observers.
- The transitive-resolution trap is now documented: anything else in `apps/web` that wants a lockfile-present-but-undeclared package must declare it first.
- If the dependency is ever dropped, `InfiniteScrollFooter` is the single call site.

## Artifacts

- Ticket: marsa-cloud/marsa#185
- Component: `apps/web/app/components/InfiniteScrollFooter.vue`
- Related: [AgDR-0040](AgDR-0040-pagination-declaration-only-contract.md) (pagination contract, amended by the same ticket)
