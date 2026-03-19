import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { getSignedInvoiceUrl } from '../../utils/signedInvoiceUrl'
import { supabase } from '../../supabaseClient'

/**
 * PhotoGallery - Before/after photo gallery component
 */
export default function PhotoGallery({ beforeImage, afterImage, jobId }) {
  const [selectedImage, setSelectedImage] = useState(null)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)

  // Load signed URLs for images
  const loadImages = async () => {
    if (!beforeImage && !afterImage) return

    setLoading(true)
    try {
      const imagePaths = []
      if (beforeImage) imagePaths.push(beforeImage)
      if (afterImage) imagePaths.push(afterImage)

      // Get signed URLs from storage
      const signedUrls = await Promise.all(
        imagePaths.map(async (path) => {
          try {
            // Try to get signed URL from storage
            const { data, error } = await supabase.storage
              .from('job-photos')
              .createSignedUrl(path, 3600)
            
            if (error) throw error
            return data?.signedUrl
          } catch (err) {
            console.error('Error loading image:', err)
            return null
          }
        })
      )

      setImages(signedUrls.filter(Boolean))
    } catch (err) {
      console.error('Error loading images:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load images on mount
  useEffect(() => {
    loadImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeImage, afterImage])

  if (!beforeImage && !afterImage) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        No photos available for this job.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="aspect-video bg-slate-200 rounded-lg animate-pulse"></div>
        <div className="aspect-video bg-slate-200 rounded-lg animate-pulse"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {beforeImage && (
          <div className="relative group">
            <img
              src={images[0] || beforeImage}
              alt="Before"
              className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setSelectedImage(images[0] || beforeImage)}
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
              Before
            </div>
          </div>
        )}
        {afterImage && (
          <div className="relative group">
            <img
              src={images[1] || images[0] || afterImage}
              alt="After"
              className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setSelectedImage(images[1] || images[0] || afterImage)}
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
              After
            </div>
          </div>
        )}
      </div>

      {/* Full-screen image viewer */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-slate-300"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={selectedImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
