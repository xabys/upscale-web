import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import imgUpscale from './lib/imgupscale.js'
import { uploadToHerta } from './lib/fileUpload.js'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

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

// Fixed download proxy endpoint
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL parameter is required' })
    }

    console.log(`[DOWNLOAD] Proxying download for: ${url}`)

    // Fetch the image from the URL
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'image/*'
      }
    })

    // Set proper headers for forced download
    const downloadFilename = filename || 'enhanced_image.jpg'
    
    // IMPORTANT: These headers force download instead of preview
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`)
    res.setHeader('Content-Type', 'application/octet-stream') // Force download
    res.setHeader('Content-Length', response.headers['content-length'] || '')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Pragma', 'no-cache')
    
    // Additional headers to prevent preview
    res.setHeader('Content-Description', 'File Transfer')
    res.setHeader('Content-Transfer-Encoding', 'binary')
    res.setHeader('Expires', '0')
    
    // Pipe the image data to response
    response.data.pipe(res)

  } catch (error) {
    console.error('[DOWNLOAD ERROR]', error.message)
    res.status(500).json({ 
      success: false, 
      error: 'Download failed: ' + error.message 
    })
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

    // Step 3: Download enhanced image and upload to Herta for local serving
    try {
      const enhancedResponse = await axios.get(enhancedUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      })

      const enhancedBuffer = Buffer.from(enhancedResponse.data)
      const enhancedName = `enhanced_${Date.now()}_${req.file.originalname}`
      
      const enhancedHertaUpload = await uploadToHerta(enhancedBuffer, enhancedName)
      
      if (enhancedHertaUpload.success) {
        // Return success response with local URL for frontend
        res.json({
          success: true,
          localUrl: enhancedHertaUpload.url,  // This is what frontend expects
          originalUrl: imageUrl,
          enhancedUrl: enhancedUrl,
          scale: scale,
          originalName: req.file.originalname
        })
      } else {
        // Fallback to direct enhanced URL if Herta upload fails
        res.json({
          success: true,
          localUrl: enhancedUrl,  // Fallback to original enhanced URL
          originalUrl: imageUrl,
          enhancedUrl: enhancedUrl,
          scale: scale,
          originalName: req.file.originalname
        })
      }
    } catch (downloadError) {
      console.error('[DOWNLOAD ERROR]', downloadError.message)
      // Fallback to direct enhanced URL
      res.json({
        success: true,
        localUrl: enhancedUrl,
        originalUrl: imageUrl,
        enhancedUrl: enhancedUrl,
        scale: scale,
        originalName: req.file.originalname
      })
    }

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
  console.log(`[SERVER] Static files served from: ${path.join(__dirname, 'public')}`)
})

export default app