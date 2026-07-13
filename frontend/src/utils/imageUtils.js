/**
 * Remove white/light background from an image and return as data URL
 * @param {string} imageSrc - Source of the image (URL or data URL)
 * @param {number} threshold - Threshold for considering a pixel as "white" (0-255)
 * @returns {Promise<string>} - Data URL of processed image
 */
export async function removeWhiteBackground(imageSrc, threshold = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      
      // Draw image
      ctx.drawImage(img, 0, 0)
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // Process pixels: make white pixels transparent
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        
        // If pixel is very close to white, make it transparent
        if (r >= 240 && g >= 240 && b >= 240 && a > 128) {
          data[i + 3] = 0  // Set alpha to 0
        }
      }
      
      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    
    img.onerror = reject
    img.src = imageSrc
  })
}
