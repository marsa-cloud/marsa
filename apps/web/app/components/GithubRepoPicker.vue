<script setup lang="ts">
import type { GitHubRepositorySummary } from '~/api/types.gen'

// useRepositoryList is an auto-import, left un-imported so tests can mock it.

const repo = defineModel<GitHubRepositorySummary | undefined>({ required: true })

const { data, status, error } = useRepositoryList()
const repos = computed(() => data.value?.items ?? [])
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    icon="i-lucide-triangle-alert"
    title="Couldn't load your GitHub repositories"
  />
  <UAlert
    v-else-if="status === 'success' && !repos.length"
    color="neutral"
    variant="subtle"
    icon="i-lucide-github"
    title="No repositories yet"
    description="Install the Marsa GitHub App on an account or organization, then come back."
  >
    <template #actions>
      <UButton
        to="/setup/github"
        size="sm"
        label="Connect GitHub"
      />
    </template>
  </UAlert>
  <USelectMenu
    v-else
    id="repo"
    v-model="repo"
    data-testid="repo-select"
    :items="repos"
    label-key="fullName"
    :loading="status === 'pending'"
    :search-input="{ placeholder: 'Search repositories' }"
    placeholder="Choose a repository"
    class="w-full"
  >
    <template #item-trailing="{ item }">
      <UIcon
        v-if="item.private"
        name="i-lucide-lock"
        class="text-muted"
        aria-label="Private"
      />
    </template>
  </USelectMenu>
</template>
