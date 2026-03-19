import { useState } from 'react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { Camera, X, Eye, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * JobPhotoPanel - Photo upload panel with thumbnail preview
 * 
 * Props:
 * - label: "Before Photos" or "After Photos"
 * - photoUrl: Existing photo URL (if any)
 * - selectedFile: Currently selected file (File object)
 * - onFileSelect: (file: File) => void
 * - onUpload: () => void
 * - onRemove: (optional) () => void - Only if remove is supported
 * - disabled: boolean
 * - uploading: boolean - Show upload progress
 */
export default function JobPhotoPanel({
  label,
  photoUrl,
  selectedFile,
  onFileSelect,
  onUpload,
  onRemove,
  disabled = false,
  uploading = false
}) {
  const [previewUrl, setPreviewUrl] = useState(null)

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file
    const { photoUpload } = await import('../../utils/photoUpload')
    const validation = photoUpload.validateFile(file)
    if (!validation.valid) {
      toast.error(validation.error)
      e.target.value = ''
      return
    }

    // Create preview
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    onFileSelect(file)
    toast.success('Photo selected! Click Upload to save.')
  }

  const handleRemove = () => {
    if (onRemove) {
      onRemove()
    }
  }

  const displayUrl = photoUrl || previewUrl

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
        {photoUrl && (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
            Uploaded
          </span>
        )}
      </div>

      {displayUrl ? (
        <div className="space-y-4">
          <div className="relative">
            <img
              src={displayUrl}
              alt={label}
              className="w-full h-64 object-cover rounded-lg border-2 border-slate-200"
            />
            {photoUrl && (
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2 p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition-colors"
                title="View full size"
              >
                <Eye className="w-4 h-4 text-slate-600" />
              </a>
            )}
          </div>

          <div className="flex gap-2">
            {!disabled && !uploading && (
              <>
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={disabled || uploading}
                    id={`replace-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                  <div className="w-full">
                    <Button
                      variant="secondary"
                      className="w-full btn-secondary pointer-events-none"
                      disabled={uploading}
                    >
                      Replace
                    </Button>
                  </div>
                </label>
                {onRemove && (
                  <Button
                    variant="tertiary"
                    onClick={handleRemove}
                    className="flex-1"
                    disabled={uploading}
                  >
                    <X className="w-4 h-4 inline mr-1" />
                    Remove
                  </Button>
                )}
              </>
            )}
            {uploading && (
              <div className="flex items-center justify-center gap-2 w-full py-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading…</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
            <Camera className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-4">No {label.toLowerCase()} uploaded yet</p>
            {!disabled && !uploading && (
              <label className="cursor-pointer inline-block">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={disabled || uploading}
                  id={`select-${label.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <div>
                  <Button
                    variant="primary"
                    className="btn-accent pointer-events-none"
                    disabled={uploading}
                  >
                    <Camera className="w-4 h-4 inline mr-2" />
                    Select Photo
                  </Button>
                </div>
              </label>
            )}
            {uploading && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading…</span>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Ready to upload:</p>
              <p className="text-sm text-slate-600">{selectedFile.name}</p>
              {uploading ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading…</span>
                </div>
              ) : (
                <Button
                  variant="primary"
                  onClick={onUpload}
                  className="w-full btn-accent"
                  disabled={!selectedFile || disabled}
                >
                  Upload {label}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
