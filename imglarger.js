import axios from 'axios'
import FormData from 'form-data'
import crypto from 'crypto'

let g = () => `${crypto.randomBytes(8).toString('hex')}_aiimglarger`

let u = async (b, n = 'temp.jpg', s = 4, t = 0) => {
  try {
    let x = g()

    let f = new FormData()
    f.append('type', t)
    f.append('username', x)
    f.append('scaleRadio', s.toString())
    f.append('file', b, { filename: n, contentType: 'image/jpeg' })

    let r = await axios.post('https://photoai.imglarger.com/api/PhoAi/Upload', f, {
      headers: {
        ...f.getHeaders(),
        'User-Agent': 'Dart/3.5 (dart:io)',
        'Accept-Encoding': 'gzip',
      },
    })

    let { code: c } = r.data.data
    console.log('[UPLOAD]', c)

    let p = { code: c, type: t, username: x, scaleRadio: s.toString() }

    let d
    for (let i = 0; i < 1000; i++) {
      let q = await axios.post('https://photoai.imglarger.com/api/PhoAi/CheckStatus', JSON.stringify(p), {
        headers: {
          'User-Agent': 'Dart/3.5 (dart:io)',
          'Accept-Encoding': 'gzip',
          'Content-Type': 'application/json',
        },
      })

      d = q.data.data
      console.log(`[CHECK ${i + 1}]`, d.status)

      if (d.status === 'success') break
      await new Promise(r => setTimeout(r, 500))
    }

    if (d.status === 'success') return d.downloadUrls[0]
    else throw new Error('Upscale gagal setelah polling maksimal.')
  } catch (e) {
    console.error('[ERR]', e.message || e)
    return e
  }
}

export default u

//use 
/*
let anu = await u(buffer)
return anu

atau

let anu = await (await import('path/imglarger.js').default
let up = await anu(buffer)
return up
*/