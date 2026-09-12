<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Awaiting approval — Marsa' })

const { data: user } = useCurrentUser()
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div class="flex flex-col items-center gap-4 py-6 text-center">
      <UIcon
        name="i-lucide-hourglass"
        class="text-2xl text-muted"
      />
      <p class="text-sm">
        You're signed in as
        <span class="font-medium">{{ user?.login }}</span>, but this Marsa install
        hasn't approved your account yet.
      </p>
      <p class="text-sm text-muted">
        Ask an operator to grant you access, then reload this page.
      </p>
    </div>
  </UCard>
</template>
