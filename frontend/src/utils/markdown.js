// frontend/src/utils/markdown.js
// 统一的 Markdown 渲染：marked v15 + marked-highlight（代码高亮）
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    },
  }),
  {
    breaks: true,   // 换行转 <br>
    gfm: true,      // GitHub Flavored Markdown
  }
)

// 把 Markdown 文本转成 HTML（出错时原样返回）
export function renderMarkdown(text) {
  if (!text) return ''
  try {
    return marked.parse(text)
  } catch {
    return text
  }
}
