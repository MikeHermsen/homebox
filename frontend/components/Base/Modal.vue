<template>
  <div class="z-[999]">
    <input :id="modalId" v-model="modal" type="checkbox" class="modal-toggle" />
    <div class="modal modal-bottom sm:modal-middle !items-end sm:!items-center overflow-y-auto p-2 sm:p-6">
      <div class="modal-box relative flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[calc(100dvh-3rem)]">
        <button :for="modalId" class="btn btn-sm btn-circle absolute right-2 top-2" @click="close">✕</button>

        <h3 class="shrink-0 pr-10 font-bold text-lg">
          <slot name="title"></slot>
        </h3>
        <div class="mt-4 min-h-0 flex-1 overflow-y-auto">
          <slot> </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const emit = defineEmits(["cancel", "update:modelValue"]);
  const props = defineProps({
    modelValue: {
      type: Boolean,
      required: true,
    },
    /**
     * in readonly mode the modal only `emits` a "cancel" event to indicate
     * that the modal was closed via the "x" button. The parent component is
     * responsible for closing the modal.
     */
    readonly: {
      type: Boolean,
      default: false,
    },
  });

  function escClose(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    }
  }

  function close() {
    if (props.readonly) {
      emit("cancel");
      return;
    }
    modal.value = false;
  }

  const modalId = useId();
  const modal = useVModel(props, "modelValue", emit);

  watchEffect(() => {
    if (modal.value) {
      document.addEventListener("keydown", escClose);
    } else {
      document.removeEventListener("keydown", escClose);
    }
  });
</script>
