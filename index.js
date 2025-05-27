const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

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
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Simple cache untuk menyimpan mapping URL (bukan image buffer)
const urlCache = new Map();

// Generate simple ID
const generateId = () => crypto.randomBytes(16).toString('hex');

// Image enhancer function (dari Document 1 - yang work)
const generateUsername = () => `${crypto.randomBytes(8).toString('hex')}_aiimglarger`;

const enhanceImage = async (buffer, filename = 'temp.jpg', scaleRatio = 4, type = 0) => {
  try {
    const username = generateUsername();

    // Upload image
    const formData = new FormData();
    formData.append('type', type);
    formData.append('username', username);
    formData.append('scaleRadio', scaleRatio.toString());
    formData.append('file', buffer, { 
      filename: filename, 
      contentType: 'image/jpeg' 
    });

    const uploadResponse = await axios.post(
      'https://photoai.imglarger.com/api/PhoAi/Upload', 
      formData, 
      {
        headers: {
          ...formData.getHeaders(),
          'User-Agent': 'Dart/3.5 (dart:io)',
          'Accept-Encoding': 'gzip',
        },
      }
    );

    const { code } = uploadResponse.data.data;
    console.log('[UPLOAD]', code);

    // Poll for completion
    const pollData = { 
      code: code, 
      type: type, 
      username: username, 
      scaleRadio: scaleRatio.toString() 
    };

    let result;
    for (let i = 0; i < 1000; i++) {
      const statusResponse = await axios.post(
        'https://photoai.imglarger.com/api/PhoAi/CheckStatus', 
        JSON.stringify(pollData), 
        {
          headers: {
            'User-Agent': 'Dart/3.5 (dart:io)',
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/json',
          },
        }
      );

      result = statusResponse.data.data;
      console.log(`[CHECK ${i + 1}]`, result.status);

      if (result.status === 'success') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (result.status === 'success') {
      return result.downloadUrls[0];
    } else {
      throw new Error('Enhancement failed after maximum polling attempts.');
    }
  } catch (error) {
    console.error('[ERROR]', error.message || error);
    throw error;
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

    console.log('Processing image:', req.file.originalname);
    
    // Enhance the image (pake function yang work dari Document 1)
    const enhancedUrl = await enhanceImage(
      req.file.buffer, 
      req.file.originalname || 'image.jpg'
    );

    console.log('Enhancement completed:', enhancedUrl);

    // Generate ID untuk mapping
    const imageId = generateId();
    const originalFilename = req.file.originalname || 'image.jpg';
    const fileExt = path.extname(originalFilename);
    const customFilename = `enhanced_${Date.now()}${fileExt}`;

    // Simpan mapping URL (bukan image buffer) - lebih ringan & serverless-friendly
    urlCache.set(imageId, {
      originalUrl: enhancedUrl,
      filename: customFilename,
      originalName: originalFilename,
      timestamp: Date.now()
    });

    // Clean up old cached URLs (older than 2 hours)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [key, value] of urlCache.entries()) {
      if (value.timestamp < twoHoursAgo) {
        urlCache.delete(key);
      }
    }

    // Return response dengan custom endpoints
    res.json({
      success: true,
      imageId: imageId,
      previewUrl: `/outputs/${imageId}`,
      downloadUrl: `/download/${imageId}`,
      filename: customFilename,
      message: 'Image enhanced successfully'
    });

  } catch (error) {
    console.error('Enhancement error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to enhance image'
    });
  }
});

// Custom endpoint untuk preview - redirect ke original imglarger URL
app.get('/outputs/:imageId', async (req, res) => {
  const imageId = req.params.imageId;
  const urlData = urlCache.get(imageId);
  
  if (!urlData) {
    return res.status(404).json({ error: 'Image not found or expired' });
  }

  try {
    // Fetch image dari original URL dan pipe ke response
    const response = await axios.get(urlData.originalUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Set proper headers
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': response.headers['content-length']
    });

    // Pipe image data
    response.data.pipe(res);
  } catch (error) {
    console.error('Error serving image:', error);
    // Fallback: redirect ke original URL
    res.redirect(urlData.originalUrl);
  }
});

// Custom endpoint untuk download
app.get('/download/:imageId', async (req, res) => {
  const imageId = req.params.imageId;
  const urlData = urlCache.get(imageId);
  
  if (!urlData) {
    return res.status(404).json({ error: 'Image not found or expired' });
  }

  try {
    // Fetch image dari original URL
    const response = await axios.get(urlData.originalUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Set download headers
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Content-Disposition': `attachment; filename="${urlData.filename}"`,
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'no-cache'
    });

    // Pipe image data
    response.data.pipe(res);
  } catch (error) {
    console.error('Error downloading image:', error);
    // Fallback: redirect ke original URL
    res.redirect(urlData.originalUrl);
  }
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
        error: 'File size too large. Maximum size is 10MB.' 
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