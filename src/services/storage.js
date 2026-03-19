import { supabase } from '../supabaseClient'

export async function uploadImage(file, folder = 'job-images') {
  if (!file) return null

  const fileName = `${folder}/${Date.now()}-${file.name}`

  const { error } = await supabase.storage
    .from('images')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    console.error('Image upload failed:', error.message)
    throw error
  }

  const { data } = supabase.storage.from('images').getPublicUrl(fileName)
  return data.publicUrl
}
