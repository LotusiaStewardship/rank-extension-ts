<script lang="ts" setup>
defineProps({
  balance: String,
})
</script>
<template>
  <div class="balance-header">Lotus Balance</div>
  <div class="balance">{{ balance }}</div>
</template>
<style lang="css" scoped>
.balance-header {
  font-size: 1.42em;
}
.balance {
  font-size: 2.69em;
  font-weight: 690;
}
</style>
