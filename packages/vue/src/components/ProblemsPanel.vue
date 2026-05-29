<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Problems</h2>
      <span class="ek-inspector-count">{{ section.problems.length }}</span>
    </header>
    <p v-if="section.problems.length === 0" class="ek-inspector-empty">No runtime problems.</p>
    <ul v-else class="ek-inspector-problems">
      <li v-for="problem in section.problems" :key="problem.id" :data-severity="problem.severity">
        <strong>{{ problem.title }}</strong>
        <span>{{ problem.detail }}</span>
        <small>
          {{ problem.severity }} · {{ problem.source }}
          <template v-if="problem.assetId"> · {{ problem.assetId }}</template>
          <template v-if="problem.actionLabel"> · {{ problem.actionLabel }}</template>
        </small>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { ProblemInspectorSection } from "@ek-aiot/3d-editor-core";

defineProps<{
  section: ProblemInspectorSection;
}>();
</script>
