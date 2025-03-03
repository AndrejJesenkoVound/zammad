<!-- Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/ -->

<script setup lang="ts">
import { loadImageIntoBase64 } from '@shared/utils/files'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, reactive, ref } from 'vue'
import DraggableResizable from 'vue3-draggable-resizable'
import log from '@shared/utils/log'
import 'vue3-draggable-resizable/dist/Vue3DraggableResizable.css'

const props = defineProps(nodeViewProps)

const needBase64Convert = (src: string) => {
  return !(src.startsWith('data:') || src.startsWith('cid:'))
}

const isResized = ref(false)
const isResizing = ref(false)
const imageLoaded = ref(false)
const isDraggable = computed(() => props.node.attrs.isDraggable)
const src = computed(() => props.node.attrs.src)
if (needBase64Convert(src.value)) {
  loadImageIntoBase64(src.value, props.node.attrs.alt).then((base64) => {
    if (base64) {
      props.updateAttributes({ src: base64 })
    } else {
      log.error(`Could not load image ${src.value}`)
      props.deleteNode()
    }
  })
}

const dimensions = reactive({
  maxWidth: 0,
  maxHeight: 0,
  height: computed({
    get: () => Number(props.node.attrs.height) || 0,
    set: (height) => props.updateAttributes({ height }),
  }),
  width: computed({
    get: () => Number(props.node.attrs.width) || 0,
    set: (width) => props.updateAttributes({ width }),
  }),
})

const onLoadImage = (e: Event) => {
  if (imageLoaded.value || needBase64Convert(src.value)) return

  const img = e.target as HTMLImageElement
  const { naturalWidth, naturalHeight } = img
  dimensions.width = naturalWidth
  dimensions.height = naturalHeight
  dimensions.maxHeight = naturalHeight
  dimensions.maxWidth = naturalWidth
  imageLoaded.value = true
}

const stopResizing = ({ w, h }: { w: number; h: number }) => {
  dimensions.width = w
  dimensions.height = h
  isResized.value = true
}

const style = computed(() => {
  if (!imageLoaded.value || !isResized.value) return {}
  const { width, height } = dimensions
  return {
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: '100%',
  }
})

// this is needed so "dragable resize" could calculate the maximum size
const wrapperStyle = computed(() => {
  if (!isResizing.value) return {}
  const { maxWidth, maxHeight } = dimensions
  return { width: maxWidth, height: maxHeight }
})
</script>

<template>
  <NodeViewWrapper as="div" class="inline-block" :style="wrapperStyle">
    <img
      v-if="!isResizing && src"
      class="inline-block"
      :style="style"
      :src="src"
      :alt="node.attrs.alt"
      :title="node.attrs.title"
      :draggable="isDraggable"
      @load="onLoadImage"
      @click="isResizing = true"
    />
    <DraggableResizable
      v-else-if="src"
      v-model:active="isResizing"
      :h="dimensions.height"
      :w="dimensions.width"
      :draggable="false"
      lock-aspect-ratio
      parent
      class="!relative !inline-block"
      @resize-end="stopResizing"
    >
      <img class="inline-block" :src="src" :draggable="isDraggable" />
    </DraggableResizable>
  </NodeViewWrapper>
</template>
