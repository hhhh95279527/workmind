<!-- frontend/src/components/rag/DocumentList.vue -->
<!-- 文档列表：展示已入库的文档，支持删除和分类筛选 -->
<template>
  <div class="doc-list-wrapper">
    <div class="list-header">
      <span class="list-title">知识库文档</span>
      <span class="doc-count">{{ filteredDocs.length }} 篇</span>
    </div>

    <!-- 分类筛选 -->
    <div v-if="knStore.categories.length > 1" class="category-tabs">
      <button
        v-for="cat in knStore.categories"
        :key="cat.value"
        class="cat-tab"
        :class="{ active: activeCategory === cat.value }"
        @click="switchCategory(cat.value)"
      >
        {{ cat.label }}
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="!filteredDocs.length" class="empty-state">
      <div class="icon">📭</div>
      <div>还没有文档</div>
      <div class="sub">上传文档后可以进行问答</div>
    </div>

    <!-- 文档列表 -->
    <div v-else class="doc-items">
      <div
        v-for="doc in filteredDocs"
        :key="doc.id"
        class="doc-item"
      >
        <div class="doc-icon">{{ docIcon(doc) }}</div>
        <div class="doc-info">
          <div class="doc-title">{{ doc.title }}</div>
          <div class="doc-meta">
            <span class="tag tag-gray">{{ doc.category }}</span>
            <span class="meta-item">{{ doc.chunks }} 片段</span>
            <span class="meta-item">{{ doc.chars?.toLocaleString() }} 字</span>
            <span class="meta-item">{{ formatDate(doc.uploadedAt) }}</span>
          </div>
          <!-- 预览文本 -->
          <div class="doc-preview">{{ doc.preview }}</div>
        </div>
        <button
          class="btn-delete"
          @click="confirmDelete(doc)"
          title="删除文档"
        >
          🗑
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge.js'
import { useAppStore } from '@/stores/app.js'

const knStore  = useKnowledgeStore()
const appStore = useAppStore()

const activeCategory = ref('')

const filteredDocs = computed(() => {
  if (!activeCategory.value) return knStore.documents
  return knStore.documents.filter(d => d.category === activeCategory.value)
})

function switchCategory(cat) {
  activeCategory.value = cat
  knStore.loadDocuments(cat)
}

function docIcon(doc) {
  const name = doc.fileName || ''
  if (name.endsWith('.pdf')) return '📄'
  if (name.endsWith('.md'))  return '📝'
  return '📃'
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diff = (now - d) / 1000

  if (diff < 60)        return '刚刚'
  if (diff < 3600)      return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400)     return Math.floor(diff / 3600) + ' 小时前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

async function confirmDelete(doc) {
  if (!confirm(`确定删除「${doc.title}」？删除后无法恢复。`)) return
  await knStore.deleteDocument(doc.id)
}
</script>

<style scoped>
.doc-list-wrapper { display: flex; flex-direction: column; height: 100%; }

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-md) var(--space-sm);
  flex-shrink: 0;
}
.list-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.doc-count {
  font-size: 11px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0 var(--space-md) var(--space-sm);
  flex-wrap: wrap;
  flex-shrink: 0;
}
.cat-tab {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: transparent;
  font-size: 11px;
  color: var(--color-text-sub);
  cursor: pointer;
  transition: all var(--transition);
}
.cat-tab:hover { border-color: var(--color-primary); color: var(--color-primary); }
.cat-tab.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.empty-state .icon { font-size: 32px; margin-bottom: 4px; }
.empty-state .sub  { font-size: 11px; }

/* 文档列表 */
.doc-items {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-sm) var(--space-md);
}

.doc-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-sm);
  border-radius: var(--radius-md);
  transition: background var(--transition);
}
.doc-item:hover { background: var(--color-border-light); }

.doc-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }

.doc-info { flex: 1; min-width: 0; }

.doc-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 11px;
  color: var(--color-text-muted);
}

.doc-preview {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

.btn-delete {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition);
  flex-shrink: 0;
  padding: 2px;
}
.doc-item:hover .btn-delete { opacity: 1; }
.btn-delete:hover { transform: scale(1.2); }
</style>
