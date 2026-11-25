<!--
  Copyright 2025 The Lotusia Stewardship
  Github: https://github.com/LotusiaStewardship
  License: MIT
-->
<script lang="ts" setup>
/**
 * The blurred-post overlay widget (Shadow Overlay context, ADR-006). Mounted once per blurred
 * post, inside that post's own shadow root. It composes only components from OVERLAY_SUBSET
 * (`LBadge`) over a plain button element, and is themed from the model's semantic roles and
 * radii, so it presents as the same brand as every other Lotusia surface (DEV-245). The base
 * contract's focus ring comes from `@lotusia/ui/base.css`, injected into the same shadow root.
 */
import { LBadge } from '@lotusia/ui'

defineProps<{
  /** The post the blurred article belongs to; surfaced on the element for handlers and diagnostics */
  postId: string
}>()

defineEmits<{
  /** The viewer asked to see the blurred post; the mount routes this to the extension's existing reveal handler */
  reveal: []
}>()
</script>

<template>
  <!--
    Geometry mirrors the old `.blurred > button` host rule: a control floating over the blurred
    article, resolving against the same containing block the plain button had, because the
    shadow host is unpositioned. No focus styles are needed here; `:focus-visible` in
    `@lotusia/ui/base.css` already draws the contract's ring inside this boundary.
  -->
  <button
    type="button"
    class="absolute left-[5%] top-[30%] w-[90%] flex items-center justify-center gap-3 rounded-xl border border-strong bg-surface px-[4%] py-[3%] text-content cursor-pointer hover:bg-surface-raised"
    :data-post-id="postId"
    @click="$emit('reveal')"
  >
    <LBadge tone="danger">poor reputation</LBadge>
    <span class="font-normal text-[15px]">Click to view</span>
  </button>
</template>
