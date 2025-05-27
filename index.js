import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import axios from 'axios'
import crypto from 'crypto'
import enhance from './imglarger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static('.'))

// Ensure tmp directory exists
const tmpDir = path.join(__dirname, 'tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Only image files are allowed!'))
    }
  }
})

// Store processed images in memory with expiration
const imageStore = new Map()
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

// Cleanup expired images every 30 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of imageStore.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      imageStore.delete(key)
      console.log(`[CLEANUP] Removed expired image: ${key}`)
    }
  }
}, 30 * 60 * 1000)

// Generate unique filename
const generateFilename = () => {
  return `enhanced_${crypto.randomBytes(16).toString('hex')}_${Date.now()}.jpg`
}

// Main enhancement endpoint
app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' })
    }

    console.log(`[ENHANCE] Processing image: ${req.file.originalname} (${req.file.size} bytes)`)

    // Get scale factor from request (default: 4x)
    const scaleRadio = parseInt(req.query.scale) || 4
    const type = parseInt(req.query.type) || 0 // 0 for general enhancement

    // Use imglarger to enhance the image
    const downloadUrl = await enhance(req.file.buffer, req.file.originalname, scaleRadio, type)
    
    if (downloadUrl instanceof Error) {
      throw downloadUrl
    }

    console.log(`[ENHANCE] Got download URL: ${downloadUrl}`)

    // Download the enhanced image
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    const enhancedBuffer = Buffer.from(response.data)
    const filename = generateFilename()

    // Store in memory cache
    imageStore.set(filename, {
      buffer: enhancedBuffer,
      originalName: req.file.originalname,
      timestamp: Date.now(),
      contentType: 'image/jpeg'
    })

    console.log(`[ENHANCE] Image stored with filename: ${filename}`)

    // Return response with custom endpoints
    res.json({
      success: true,
      filename: filename,
      originalName: req.file.originalname,
      previewUrl: `/api/output/${filename}`,
      downloadUrl: `/api/download/${filename}`,
      size: enhancedBuffer.length,
      scale: scaleRadio
    })

  } catch (error) {
    console.error('[ENHANCE ERROR]', error.message || error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Enhancement failed' 
    })
  }
})

// Custom output endpoint for preview/display
app.get('/api/output/:filename', (req, res) => {
  try {
    const filename = req.params.filename
    const imageData = imageStore.get(filename)

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found or expired' })
    }

    // Set appropriate headers for image display
    res.set({
      'Content-Type': imageData.contentType,
      'Content-Length': imageData.buffer.length,
      'Cache-Control': 'public, max-age=3600',
      'Last-Modified': new Date(imageData.timestamp).toUTCString()
    })

    res.send(imageData.buffer)
    console.log(`[OUTPUT] Served image: ${filename}`)

  } catch (error) {
    console.error('[OUTPUT ERROR]', error)
    res.status(500).json({ error: 'Failed to serve image' })
  }
})

// Custom download endpoint
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename
    const imageData = imageStore.get(filename)

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found or expired' })
    }

    // Set headers for file download
    const downloadName = `enhanced_${imageData.originalName}` || filename
    
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': imageData.buffer.length,
      'Cache-Control': 'no-cache'
    })

    res.send(imageData.buffer)
    console.log(`[DOWNLOAD] File downloaded: ${filename} as ${downloadName}`)

  } catch (error) {
    console.error('[DOWNLOAD ERROR]', error)
    res.status(500).json({ error: 'Failed to download image' })
  }
})

// Status endpoint to check if image exists
app.get('/api/status/:filename', (req, res) => {
  const filename = req.params.filename
  const imageData = imageStore.get(filename)
  
  if (imageData) {
    res.json({
      exists: true,
      filename: filename,
      originalName: imageData.originalName,
      size: imageData.buffer.length,
      timestamp: imageData.timestamp,
      expiresIn: CACHE_DURATION - (Date.now() - imageData.timestamp)
    })
  } else {
    res.json({ exists: false })
  }
})

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    cachedImages: imageStore.size,
    uptime: process.uptime()
  })
})

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB.' })
    }
  }
  
  console.error('[SERVER ERROR]', error)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

// Start server
app.listen(port, () => {
  console.log(`[SERVER] Image Enhancer running on port ${port}`)
  console.log(`[SERVER] Cache duration: ${CACHE_DURATION / 1000 / 60} minutes`)
  console.log(`[SERVER] Max file size: 10MB`)
})

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] Received SIGTERM, shutting down gracefully...')
  imageStore.clear()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[SERVER] Received SIGINT, shutting down gracefully...')
  imageStore.clear()
  process.exit(0)
})

export default app
