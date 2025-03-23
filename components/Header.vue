<script lang="ts" setup>
const props = defineProps({
  balance: String,
})
</script>
<template class="container mx-auto">
  <div>
    <span class="balance-header">Lotus Balance</span>
  </div>
  <div class="balance">
    <!-- Need to always split balance prop to maintain reactivity -->
    <span class="balance">{{ props.balance!.split('.')[0] }}</span>
    <!-- Need to always split balance prop to maintain reactivity -->
    <span class="balance-suffix">.{{ props.balance!.split('.')[1] }}</span>
  </div>
</template>
<style lang="css">
.balance-header {
  font-size: 1.2rem;
}
.balance {
  font-size: 1.5rem;
  font-weight: 700;
}
.balance-suffix {
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
