// server/src/routes/health.js
import express from 'express'
import { cache } from '../services/cache.js'

export const healthRouter = express.Router()

const startTime = Date.now()

healthRouter.get('/live', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) })
})

healthRouter.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    cache:  cache.getStats(),
    version: '1.0.0',
  })
})
