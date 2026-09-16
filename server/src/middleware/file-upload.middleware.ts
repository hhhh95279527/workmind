// server/src/middleware/file-upload.middleware.ts
// multer 文件上传（知识库文档上传用）
// memoryStorage：文件先存内存，再由业务代码决定怎么处理
// diskStorage：直接存磁盘（大文件推荐）
import multer from 'multer'
import path from 'path'
import type { NextFunction, Request, Response } from 'express'

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => {
      const ext  = path.extname(file.originalname)
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`
      cb(null, name)
    },
  }),
  limits: {
    fileSize: 30 * 1024 * 1024,  // 最大 30MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许这几种格式
    const allowed = ['.txt', '.md', '.pdf']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件格式 ${ext}，只支持 ${allowed.join(', ')}`))
    }
  },
})

const singleFile = upload.single('file')

export function fileUpload(req: Request, res: Response, next: NextFunction) {
  singleFile(req, res, (err?: any) => {
    if (err) return next(err)
    next()
  })
}

// 合同上传：在知识库允许的格式外追加 .docx（合同最常见格式）
const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => {
      const ext  = path.extname(file.originalname)
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`
      cb(null, name)
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.pdf', '.docx']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件格式 ${ext}，只支持 ${allowed.join(', ')}`))
    }
  },
}).single('file')

export function contractFileUpload(req: Request, res: Response, next: NextFunction) {
  contractUpload(req, res, (err?: any) => {
    if (err) return next(err)
    next()
  })
}
