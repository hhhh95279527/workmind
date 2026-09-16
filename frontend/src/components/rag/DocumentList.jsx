// frontend/src/components/rag/DocumentList.jsx
// 文档列表：展示已入库的文档，支持删除和分类筛选
import { useState } from 'react'
import { Modal } from 'antd'
import { useKnowledgeStore } from '@/stores/knowledge.js'
import styles from './DocumentList.module.css'

function docIcon(doc) {
  const name = doc.fileName || ''
  if (name.endsWith('.pdf')) return '📄'
  if (name.endsWith('.md')) return '📝'
  return '📃'
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diff = (now - d) / 1000

  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export default function DocumentList() {
  const documents = useKnowledgeStore((s) => s.documents)
  const categories = useKnowledgeStore((s) => s.categories)
  const loadDocuments = useKnowledgeStore((s) => s.loadDocuments)
  const deleteDocument = useKnowledgeStore((s) => s.deleteDocument)

  const [activeCategory, setActiveCategory] = useState('')

  const filteredDocs = !activeCategory
    ? documents
    : documents.filter((d) => d.category === activeCategory)

  function switchCategory(cat) {
    setActiveCategory(cat)
    loadDocuments(cat).catch(() => {})
  }

  function confirmDelete(doc) {
    Modal.confirm({
      title: '删除文档',
      content: `确定删除「${doc.title}」？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDocument(doc.id)
        } catch {}
      },
    })
  }

  return (
    <div className={styles['doc-list-wrapper']}>
      <div className={styles['list-header']}>
        <span className={styles['list-title']}>知识库文档</span>
        <span className={styles['doc-count']}>{filteredDocs.length} 篇</span>
      </div>

      {/* 分类筛选 */}
      {categories.length > 1 && (
        <div className={styles['category-tabs']}>
          {categories.map((cat) => (
            <button
              key={cat.value}
              className={`${styles['cat-tab']} ${activeCategory === cat.value ? styles.active : ''}`}
              onClick={() => switchCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!filteredDocs.length ? (
        <div className={styles['empty-state']}>
          <div className={styles.icon}>📭</div>
          <div>还没有文档</div>
          <div className={styles.sub}>上传文档后可以进行问答</div>
        </div>
      ) : (
        /* 文档列表 */
        <div className={styles['doc-items']}>
          {filteredDocs.map((doc) => (
            <div key={doc.id} className={styles['doc-item']}>
              <div className={styles['doc-icon']}>{docIcon(doc)}</div>
              <div className={styles['doc-info']}>
                <div className={styles['doc-title']}>{doc.title}</div>
                <div className={styles['doc-meta']}>
                  <span className="tag tag-gray">{doc.category}</span>
                  <span className={styles['meta-item']}>{doc.chunks} 片段</span>
                  <span className={styles['meta-item']}>{doc.chars?.toLocaleString()} 字</span>
                  <span className={styles['meta-item']}>{formatDate(doc.uploadedAt)}</span>
                </div>
                {/* 预览文本 */}
                <div className={styles['doc-preview']}>{doc.preview}</div>
              </div>
              <button
                className={styles['btn-delete']}
                onClick={() => confirmDelete(doc)}
                title="删除文档"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
