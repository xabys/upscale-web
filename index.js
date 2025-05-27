const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const sharp = require('sharp');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Store enhanced images in memory (for serverless compatibility)
const imageCache = new Map();

// Generate proper UUID format
const generateUUID = () => {
  const hex = crypto.randomBytes(16).toString('hex');
  return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20,32)}`;
};

// Improved image enhancer function with 2x scaling
const generateUsername = () => `${crypto.randomBytes(12).toString('hex')}_aiimglarger`;

const enhanceImage = async (buffer, filename = 'temp.jpg', scaleRatio = 2, type = 0) => {
  try {
    const username = generateUsername();

    // Upload image with better headers and configuration
    const formData = new FormData();
    formData.append('type', type);
    formData.append('username', username);
    formData.append('scaleRadio', scaleRatio.toString());
    
    // Determine content type based on filename
    let contentType = 'image/jpeg';
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    
    formData.append('file', buffer, { 
      filename: filename,
      contentType: contentType
    });

    console.log(`[ENHANCE] Starting enhancement for ${filename} with ${scaleRatio}x scale`);

    const uploadResponse = await axios.post(
      'https://photoai.imglarger.com/api/PhoAi/Upload', 
      formData, 
      {
        headers: {
          ...formData.getHeaders(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://imglarger.com',
          'Referer': 'https://imglarger.com/'
        },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    if (!uploadResponse.data || !uploadResponse.data.data || !uploadResponse.data.data.code) {
      throw new Error('Invalid upload response from server');
    }

    const { code } = uploadResponse.data.data;
    console.log('[UPLOAD] Success, code:', code);

    // Poll for completion with better error handling
    const pollData = { 
      code: code, 
      type: type, 
      username: username, 
      scaleRadio: scaleRatio.toString() 
    };

    let result;
    let attempts = 0;
    const maxAttempts = 120;
    
    while (attempts < maxAttempts) {
      try {
        const statusResponse = await axios.post(
          'https://photoai.imglarger.com/api/PhoAi/CheckStatus', 
          JSON.stringify(pollData), 
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Encoding': 'gzip, deflate, br',
              'Content-Type': 'application/json',
              'Origin': 'https://imglarger.com',
              'Referer': 'https://imglarger.com/'
            },
            timeout: 10000
          }
        );

        if (statusResponse.data && statusResponse.data.data) {
          result = statusResponse.data.data;
          console.log(`[CHECK ${attempts + 1}] Status: ${result.status}`);

          if (result.status === 'success' && result.downloadUrls && result.downloadUrls.length > 0) {
            console.log('[SUCCESS] Enhancement completed');
            return result.downloadUrls[0];
          } else if (result.status === 'error' || result.status === 'failed') {
            throw new Error(`Enhancement failed with status: ${result.status}`);
          }
        }
      } catch (pollError) {
        console.log(`[POLL ERROR ${attempts + 1}]`, pollError.message);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('Enhancement timeout after maximum polling attempts');
  } catch (error) {
    console.error('[ENHANCE ERROR]', error.message || error);
    throw error;
  }
};

// Function to convert image to PNG with maximum quality
const convertToPNG = async (imageBuffer) => {
  try {
    console.log('[PNG CONVERT] Converting image to PNG with maximum quality');
    
    const pngBuffer = await sharp(imageBuffer)
      .png({
        quality: 100,
        compressionLevel: 0, // No compression for maximum quality
        adaptiveFiltering: false,
        force: true
      })
      .toBuffer();
    
    console.log(`[PNG CONVERT] Conversion completed. Original: ${imageBuffer.length} bytes, PNG: ${pngBuffer.length} bytes`);
    return pngBuffer;
  } catch (error) {
    console.error('[PNG CONVERT ERROR]', error);
    throw new Error('Failed to convert image to PNG: ' + error.message);
  }
};

// API endpoint for image enhancement
app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image file provided' 
      });
    }

    console.log('Processing image:', req.file.originalname, 'Size:', req.file.size);
    
    // Enhance the image with 2x scale for HD quality
    const enhancedUrl = await enhanceImage(
      req.file.buffer, 
      req.file.originalname || 'image.jpg',
      2, // Changed to 2x scale for HD quality
      0  // Type 0 for general enhancement
    );

    console.log('Enhancement completed:', enhancedUrl);

    // Download the enhanced image
    const imageResponse = await axios.get(enhancedUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Convert the enhanced image to high-quality PNG
    const originalBuffer = Buffer.from(imageResponse.data);
    const pngBuffer = await convertToPNG(originalBuffer);

    // Generate proper UUID format like "b0dff5a2-78f3-41b8-8e7c-62acecadb793"
    const imageId = generateUUID();
    const finalFilename = `${imageId}.png`; // Always PNG with UUID filename
    
    // Store PNG image data in memory cache
    imageCache.set(imageId, {
      buffer: pngBuffer,
      contentType: 'image/png',
      filename: finalFilename,
      timestamp: Date.now()
    });

    // Clean up old cached images (older than 2 hours)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [key, value] of imageCache.entries()) {
      if (value.timestamp < twoHoursAgo) {
        imageCache.delete(key);
      }
    }

    console.log(`High-quality PNG image cached with ID: ${imageId}, Size: ${pngBuffer.length} bytes`);

    res.json({
      success: true,
      imageId: imageId,
      previewUrl: `/outputs/${finalFilename}`,
      downloadUrl: `/download/${finalFilename}`,
      filename: finalFilename,
      message: 'Image enhanced to 2x HD quality and converted to PNG successfully'
    });

  } catch (error) {
    console.error('Enhancement error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to enhance image'
    });
  }
});

// Serve enhanced image for preview
app.get('/outputs/:filename', (req, res) => {
  const filename = req.params.filename;
  const imageId = filename.replace('.png', ''); // Remove .png extension to get UUID
  const imageData = imageCache.get(imageId);
  
  if (!imageData) {
    return res.status(404).json({ error: 'Image not found or expired' });
  }

  // Set proper headers for high quality PNG serving
  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=7200, s-maxage=7200',
    'Content-Length': imageData.buffer.length,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff'
  });

  res.send(imageData.buffer);
});

// Download enhanced image with proper UUID filename
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const imageId = filename.replace('.png', ''); // Remove .png extension to get UUID
  const imageData = imageCache.get(imageId);
  
  if (!imageData) {
    return res.status(404).json({ error: 'Image not found or expired' });
  }

  // Download with UUID-style filename like "b0dff5a2-78f3-41b8-8e7c-62acecadb793.png"
  res.set({
    'Content-Type': 'image/png',
    'Content-Disposition': `attachment; filename="${imageData.filename}"`,
    'Content-Length': imageData.buffer.length,
    'Cache-Control': 'no-cache'
  });

  res.send(imageData.buffer);
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        error: 'File size too large. Maximum size is 20MB.' 
      });
    }
  }
  
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Export for Vercel serverless function
module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Visit http://localhost:${port} to use the image enhancer`);
  });
}