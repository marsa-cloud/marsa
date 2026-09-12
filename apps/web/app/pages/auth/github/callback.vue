<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Signing in… — Marsa' })

type Status = 'loading' | 'cancelled' | 'declined' | 'failed'

const MESSAGES: Record<Status, string> = {
  loading: 'Completing sign-in…',
  cancelled: 'Sign-in was cancelled. You can try again whenever you’re ready.',
  declined: 'GitHub declined the sign-in request. Please try again.',
  failed: 'Sign-in failed. Please try again.',
}

const { completeLogin } = useGithubLogin()
const { refresh } = useCurrentUser()

const status = ref<Status>('loading')
const message = computed(() => MESSAGES[status.value])

onMounted(async () => {
  const outcome = resolveGithubLoginQuery(useRoute().query)
  if (outcome.status !== 'proceed') {
    status.value = outcome.status
    return
  }

  try {
    await completeLogin(outcome.code, outcome.state)
    await refresh()
    await navigateTo('/')
  } catch {
    status.value = 'failed'
  }
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div
      role="status"
      aria-live="polite"
      class="flex flex-col items-center gap-4 py-6"
    >
      <template v-if="status === 'loading'">
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin text-2xl"
        />
        <p class="text-sm text-muted">
          {{ message }}
        </p>
      </template>
      <template v-else-if="status === 'cancelled'">
        <UIcon
          name="i-lucide-circle-slash"
          class="text-2xl text-muted"
        />
        <p class="text-sm text-muted">
          {{ message }}
        </p>
        <UButton
          variant="ghost"
          to="/login"
        >
          Back to sign in
        </UButton>
      </template>
      <template v-else>
        <UIcon
          name="i-lucide-circle-x"
          class="text-2xl text-error"
        />
        <p class="text-sm">
          {{ message }}
        </p>
        <UButton
          variant="ghost"
          to="/login"
        >
          Try again
        </UButton>
      </template>
    </div>
  </UCard>
</template>
