<!-- frontend/src/components/rag/DocumentUploader.vue -->
<!-- 文档上传：拖拽上传 + 点击上传 + 粘贴文本 -->
<template>
  <div class="uploader-wrapper">
    <!-- 标题栏 -->
    <div class="section-header">
      <h3 class="section-title">添加文档</h3>
      <button
        class="btn-text"
        @click="showTextInput = !showTextInput"
      >
        {{ showTextInput ? '← 上传文件' : '粘贴文本 →' }}
      </button>
    </div>

    <!-- 方式一：文件上传 -->
    <div v-if="!showTextInput">
      <div
        class="drop-zone"
        :class="{ 'drag-over': isDragging, 'has-file': selectedFile }"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.md,.pdf"
          hidden
          @change="onFileChange"
        />

        <!-- 未选择文件 -->
        <div v-if="!selectedFile" class="drop-hint">
          <div class="drop-icon">📂</div>
          <div class="drop-text">拖拽文件到此处，或点击选择</div>
          <div class="drop-sub">支持 .txt、.md、.pdf，最大 10MB</div>
        </div>

        <!-- 已选择文件 -->
        <div v-else class="file-preview">
          <div class="file-icon">{{ fileIcon }}</div>
          <div class="file-info">
            <div class="file-name">{{ selectedFile.name }}</div>
            <div class="file-size">{{ formatSize(selectedFile.size) }}</div>
          </div>
          <button class="btn-remove" @click.stop="clearFile">×</button>
        </div>
      </div>

      <!-- 标题和分类 -->
      <div class="form-row">
        <input
          v-model="form.title"
          class="input"
          placeholder="文档标题（可选，默认用文件名）"
        />
        <select v-model="form.category" class="input select">
          <option value="通用">通用</option>
          <option value="技术文档">技术文档</option>
          <option value="HR制度">HR 制度</option>
          <option value="产品手册">产品手册</option>
          <option value="法律合规">法律合规</option>
          <option value="业务流程">业务流程</option>
        </select>
      </div>

      <!-- 上传进度 -->
      <div v-if="knStore.uploading" class="progress-bar">
        <div class="progress-fill" :style="{ width: knStore.uploadProgress + '%' }" />
        <span class="progress-text">{{ knStore.uploadProgress < 80 ? '上传中...' : '向量化处理中...' }}</span>
      </div>

      <button
        class="btn btn-primary upload-btn"
        @click="doUpload"
        :disabled="!selectedFile || knStore.uploading"
      >
        {{ knStore.uploading ? '处理中...' : '📥 上传入库' }}
      </button>
    </div>

    <!-- 方式二：粘贴文本 -->
    <div v-else class="text-input-form">
      <input
        v-model="form.title"
        class="input"
        placeholder="文档标题（必填）"
      />
      <select v-model="form.category" class="input select">
        <option value="通用">通用</option>
        <option value="技术文档">技术文档</option>
        <option value="HR制度">HR 制度</option>
        <option value="产品手册">产品手册</option>
        <option value="法律合规">法律合规</option>
        <option value="业务流程">业务流程</option>
      </select>
      <textarea
        v-model="form.content"
        class="input textarea"
        placeholder="在此粘贴文档内容..."
        rows="6"
      />
      <div class="char-hint">{{ form.content.length }} 字</div>
      <button
        class="btn btn-primary upload-btn"
        @click="doUploadText"
        :disabled="!form.title.trim() || !form.content.trim() || knStore.uploading"
      >
        {{ knStore.uploading ? '处理中...' : '📥 添加入库' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge.js'

const knStore = useKnowledgeStore()

const showTextInput = ref(false)
const isDragging    = ref(false)
const selectedFile  = ref(null)
const fileInput     = ref(null)

const form = ref({ title: '', category: '通用', content: '' })

const fileIcon = computed(() => {
  const ext = selectedFile.value?.name?.split('.').pop()?.toLowerCase()
  return ext === 'pdf' ? '📄' : ext === 'md' ? '📝' : '📃'
})

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function onDrop(e) {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) setFile(file)
}

function onFileChange(e) {
  const file = e.target.files[0]
  if (file) setFile(file)
}

function setFile(file) {
  selectedFile.value = file
  if (!form.value.title) {
    form.value.title = file.name.replace(/\.[^.]+$/, '')
  }
}

function clearFile() {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function doUpload() {
  if (!selectedFile.value) return
  await knStore.uploadFile(selectedFile.value, {
    title: form.value.title,
    category: form.value.category,
  })
  clearFile()
  form.value.title = ''
}

async function doUploadText() {
  if (!form.value.title.trim() || !form.value.content.trim()) return
  await knStore.uploadText({
    title:    form.value.title,
    category: form.value.category,
    content:  form.value.content,
  })
  form.value = { title: '', category: '通用', content: '' }
}
</script>

<style scoped>
.uploader-wrapper { padding: var(--space-md); }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}
.section-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.btn-text {
  font-size: 12px;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
}

/* 拖拽区域 */
.drop-zone {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition);
  margin-bottom: var(--space-md);
  min-height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.drop-zone:hover, .drop-zone.drag-over {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}
.drop-zone.has-file { border-style: solid; border-color: var(--color-success); }

.drop-hint { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.drop-icon { font-size: 28px; }
.drop-text { font-size: 13px; font-weight: 500; color: var(--color-text-sub); }
.drop-sub { font-size: 11px; color: var(--color-text-muted); }

.file-preview {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
}
.file-icon { font-size: 28px; }
.file-info { flex: 1; text-align: left; }
.file-name { font-size: 13px; font-weight: 500; color: var(--color-text); }
.file-size { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.btn-remove {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-border);
  border: none;
  color: var(--color-text-sub);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-remove:hover { background: var(--color-danger); color: #fff; }

.form-row { display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.form-row .input:first-child { flex: 1; }
.select { width: 130px; flex-shrink: 0; }

.text-input-form { display: flex; flex-direction: column; gap: var(--space-sm); }
.textarea { min-height: 120px; }
.char-hint { font-size: 11px; color: var(--color-text-muted); text-align: right; margin-top: -4px; }

/* 进度条 */
.progress-bar {
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-sm);
  position: relative;
}
.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width .3s ease;
}
.progress-text {
  position: absolute;
  right: 0;
  top: 6px;
  font-size: 10px;
  color: var(--color-text-muted);
}

.upload-btn { width: 100%; justify-content: center; margin-top: var(--space-sm); }
</style>
