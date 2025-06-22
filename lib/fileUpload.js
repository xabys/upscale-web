import axios from 'axios'
import FormData from 'form-data'

const HERTA_UPLOAD_URL = 'https://file.herta.web.id/api/upload'
const HERTA_BASE_URL = 'https://file.herta.web.id/x'

export async function uploadToHerta(buffer, originalName) {
  try {
    console.log(`[HERTA] Uploading: ${originalName}`)
    
    const form = new FormData()
    form.append('file', buffer, {
      filename: originalName,
      contentType: getContentType(originalName)
    })

    const response = await axios.post(HERTA_UPLOAD_URL, form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 30000
    })

    if (response.data && response.data.success && response.data.files && response.data.files.length > 0) {
      const file = response.data.files[0]
      const fileUrl = `${HERTA_BASE_URL}/${file.filename}${file.extension}`
      
      console.log(`[HERTA] Upload successful: ${fileUrl}`)
      
      return {
        success: true,
        url: fileUrl,
        filename: file.filename,
        extension: file.extension,
        originalName: file.originalName,
        size: file.size,
        type: file.type
      }
    } else {
      throw new Error('Invalid response from upload service')
    }

  } catch (error) {
    console.error('[HERTA ERROR]', error.message)
    return {
      success: false,
      error: error.message || 'Upload failed'
    }
  }
}

function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop()
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp'
  }
  return types[ext] || 'image/jpeg'
}
