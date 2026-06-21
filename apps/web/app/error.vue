<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps({
  error: Object as () => NuxtError,
})
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
