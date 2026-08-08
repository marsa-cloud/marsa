---
paths:
  - 'apps/web/app/**/*.vue'
---

# Components and pages (Nuxt 4 + Nuxt UI v4)

## `UDashboardPanel`: use `#header` and `#body`, never the default slot

```vue
<!-- WRONG — content taller than the viewport becomes unreachable -->
<UDashboardPanel>
  <UDashboardNavbar title="Apps" />
  <div>…long form…</div>
</UDashboardPanel>

<!-- RIGHT -->
<UDashboardPanel>
  <template #header>
    <UDashboardNavbar title="Apps" />
  </template>
  <template #body>
    <div>…long form…</div>
  </template>
</UDashboardPanel>
```

Why: `#body` ships the scroll wrapper (`flex-1 overflow-y-auto`). The default slot has none,
and the dashboard root is `fixed inset-0 overflow-hidden`, so overflowing content is clipped
with no scrollbar. Symptom: a long form's submit button cannot be scrolled to.

## `UDashboardSidebarItem` does not exist in Nuxt UI v4

```vue
<!-- WRONG — renders an empty sidebar, silently -->
<UDashboardSidebarItem to="/apps" label="Apps" />

<!-- RIGHT -->
<UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" />
```

Make the sidebar `collapsible` and put `UDashboardSidebarCollapse` in its `#header` slot so
the toggle works.

## Leave auto-imported composables un-imported

```ts
// WRONG — an explicit import defeats mockNuxtImport, so the test hits the real composable
import { useAppList } from '~/composables/useAppList'

// RIGHT — no import line
const { data, status, error } = useAppList()
```

## Naming

Pages are route-named by filename (`pages/apps/[slug].vue` → `/apps/:slug`). Components are
PascalCase and auto-imported by path, with nested dirs prefixing the name
(`components/app/Logo.vue` → `<AppLogo />`).

Do **not** introduce `*View.vue` screens, a `.composable.ts` suffix, per-feature nested
composables, or TanStack-style `.query.ts` / `.mutation.ts` files. None fit Nuxt's
conventions, and the middle two break auto-import.
