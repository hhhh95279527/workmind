// frontend/src/views/KnowledgeView.jsx
// 知识库页面：左侧上传/文档列表，右侧 RAG 问答
import { useEffect } from 'react'
import { useKnowledgeStore } from '@/stores/knowledge.js'
import DocumentUploader from '@/components/rag/DocumentUploader.jsx'
import DocumentList from '@/components/rag/DocumentList.jsx'
import RagChat from '@/components/rag/RagChat.jsx'
import styles from './KnowledgeView.module.css'

export default function KnowledgeView() {
  useEffect(() => {
    const kn = useKnowledgeStore.getState()
    kn.loadDocuments()
    kn.loadCategories()
  }, [])

  return (
    <div className={styles['knowledge-view']}>
      <aside className={styles['doc-panel']}>
        <DocumentUploader />
        <div className={styles.divider} />
        <DocumentList />
      </aside>
      <RagChat />
    </div>
  )
}
