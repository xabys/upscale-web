import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import imgUpscale from './lib/imgupscale.js'
import { uploadToHerta } from './lib/fileUpload.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (mimetype && extname) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed!'))
    }
  }
})

// Main enhancement endpoint
app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' })
    }

    console.log(`[ENHANCE] Processing: ${req.file.originalname} (${req.file.size} bytes)`)

    // Step 1: Upload original image to Herta
    const hertaUpload = await uploadToHerta(req.file.buffer, req.file.originalname)
    if (!hertaUpload.success) {
      throw new Error('Failed to upload image to storage')
    }

    const imageUrl = hertaUpload.url
    console.log(`[HERTA] Image uploaded: ${imageUrl}`)

    // Step 2: Enhance image using imgUpscale
    const scale = req.query.scale || "4"
    const result = await imgUpscale(imageUrl, scale)
    
    if (!result || !result.data || result.data.status !== 'success') {
      throw new Error('Image enhancement failed')
    }

    const enhancedUrl = result.data.downloadUrls[0]
    console.log(`[ENHANCE] Enhanced image URL: ${enhancedUrl}`)

    // Return success response
    res.json({
      success: true,
      originalUrl: imageUrl,
      enhancedUrl: enhancedUrl,
      scale: scale,
      originalName: req.file.originalname
    })

  } catch (error) {
    console.error('[ENHANCE ERROR]', error.message)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Enhancement failed' 
    })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Max 10MB.' })
    }
  }
  
  console.error('[SERVER ERROR]', error.message)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`[SERVER] Image Enhancer running on port ${port}`)
})

export default app
