import axios from "axios"
import FormData from "form-data"

const VALID_RATIO = {
  "4": 4,
  "2": 2
}

async function imgUpscale(urlImage, ratio) {
  if (!Object.keys(VALID_RATIO).includes(ratio)) {
    throw new Error(`Invalid upscale ratio. Use: ${Object.keys(VALID_RATIO).join(", ")}`)
  }

  try {
    console.log(`[UPSCALE] Starting enhancement for: ${urlImage}`)
    
    // Download image from URL
    const imageResponse = await axios.get(urlImage, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 30000
    })

    // Prepare form data
    const form = new FormData()
    form.append("myfile", Buffer.from(imageResponse.data), `${Date.now()}_upscale.jpg`)
    form.append("scaleRadio", ratio)

    // Upload to imglarger
    const uploadResponse = await axios.post("https://get1.imglarger.com/api/UpscalerNew/UploadNew", form, {
      headers: {
        ...form.getHeaders(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://imgupscaler.com",
        "Referer": "https://imgupscaler.com/"
      },
      timeout: 30000
    })

    const code = uploadResponse.data.data.code
    console.log(`[UPSCALE] Upload code: ${code}`)

    // Poll for completion
    const payload = { code: code, scaleRadio: ratio }
    let result
    let attempts = 0
    const maxAttempts = 60 // 2 minutes max

    do {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const statusResponse = await axios.post("https://get1.imglarger.com/api/UpscalerNew/CheckStatusNew", payload, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://imgupscaler.com",
          "Referer": "https://imgupscaler.com/"
        },
        timeout: 15000
      })
      
      result = statusResponse
      attempts++
      
      console.log(`[UPSCALE] Check ${attempts}: ${result.data.data.status}`)
      
      if (attempts >= maxAttempts) {
        throw new Error('Enhancement timeout after 2 minutes')
      }
      
    } while (result.data.data.status !== "success")

    console.log(`[UPSCALE] Enhancement completed successfully`)
    return result.data

  } catch (error) {
    console.error('[UPSCALE ERROR]', error.message)
    throw new Error(`Enhancement failed: ${error.message}`)
  }
}

export default imgUpscale
