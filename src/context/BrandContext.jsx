import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useUser } from './UserContext'

const BrandContext = createContext(null)

/**
 * BrandProvider - Loads and applies tenant branding globally
 * 
 * Features:
 * - Loads company branding from companies table
 * - Injects CSS variables for theming
 * - Provides brand object via useBrand() hook
 * - Supports public pages via token-based brand fetch
 */
export function BrandProvider({ children, publicToken = null, publicBrandData = null }) {
  const { profile, session } = useUser()
  const [brand, setBrand] = useState(null)
  const [loading, setLoading] = useState(true)

  // Helper: Calculate text color based on background brightness
  const getTextOnPrimary = (color) => {
    if (!color) return '#ffffff'
    
    // Remove # if present
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Calculate brightness (0-255)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    // Use white text for dark backgrounds, black for light
    return brightness > 128 ? '#000000' : '#ffffff'
  }

  // Helper: Calculate hover color (darker)
  const getHoverColor = (color) => {
    if (!color) return '#15803d'
    
    // Remove # if present
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Darken by 15%
    const darken = 0.85
    const newR = Math.max(0, Math.floor(r * darken))
    const newG = Math.max(0, Math.floor(g * darken))
    const newB = Math.max(0, Math.floor(b * darken))
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
  }

  // Helper: Get signed logo URL from logo_path
  const getLogoUrl = async (logoPath, companyId) => {
    if (logoPath && companyId) {
      try {
        const { data, error } = await supabase.storage
          .from('branding')
          .createSignedUrl(logoPath, 3600) // 1 hour expiry
        
        if (!error && data?.signedUrl) {
          return data.signedUrl
        }
      } catch (err) {
        console.warn('Failed to get signed logo URL:', err)
      }
    }
    
    return null
  }

  // Load brand from public token (for public pages)
  const loadPublicBrand = useCallback(async () => {
    if (!publicToken) return null

    try {
      // Try to get brand from public RPC
      const { data, error } = await supabase.rpc('get_company_branding_public', {
        p_token: publicToken
      })

      if (error) {
        // If RPC doesn't exist, try get_quote_public as fallback
        const { data: quoteData, error: quoteError } = await supabase.rpc('get_quote_public', {
          p_token: publicToken
        })

        if (quoteError || !quoteData?.ok) {
          return null
        }

        // Extract company branding from quote response
        // Support both flat fields (company_display_name) and nested object (company.display_name)
        const q = quoteData?.quote || {}
        const company = q.company || {}
        
        return {
          display_name: q.company_display_name || q.company_name || company.display_name || company.name || 'Company',
          logo_path: q.company_logo_path || company.logo_path || null,
          primary_color: q.company_primary_color || company.primary_color || '#22c55e',
          secondary_color: q.company_secondary_color || company.secondary_color || null,
          accent_color: q.company_accent_color || company.accent_color || null,
        }
      }

      return data
    } catch (err) {
      console.warn('Error loading public brand:', err)
      return null
    }
  }, [publicToken])

  // Load brand from authenticated user's company
  const loadAuthenticatedBrand = useCallback(async () => {
    if (!profile?.company_id) return null

    try {
      const { data: company, error } = await supabase
        .from('companies')
        .select('display_name, name, logo_path, primary_color, secondary_color, accent_color')
        .eq('id', profile.company_id)
        .single()

      if (error) {
        console.error('Error loading company brand:', error)
        return null
      }

      return company
    } catch (err) {
      console.error('Error loading company brand:', err)
      return null
    }
  }, [profile?.company_id])

  // Main load function
  const loadBrand = useCallback(async () => {
    setLoading(true)

    try {
      let companyData = null

      // Use public brand data if provided (from props)
      if (publicBrandData) {
        companyData = publicBrandData
      }
      // Try public token fetch
      else if (publicToken) {
        companyData = await loadPublicBrand()
      }
      // Try authenticated user's company
      else if (profile?.company_id) {
        companyData = await loadAuthenticatedBrand()
      }

      if (!companyData) {
        // Use defaults
        setBrand({
          companyDisplayName: 'Company',
          logoUrl: null,
          primaryColor: '#22c55e',
          primaryHoverColor: '#15803d',
          textOnPrimary: '#ffffff',
          secondaryColor: null,
          secondaryHoverColor: null,
          accentColor: null,
          accentHoverColor: null,
        })
        setLoading(false)
        return
      }

      // Get logo URL from logo_path only
      const logoUrl = await getLogoUrl(
        companyData.logo_path,
        profile?.company_id || null
      )

      // Build brand object
      const primaryColor = companyData.primary_color || '#22c55e'
      const primaryHoverColor = getHoverColor(primaryColor)
      const textOnPrimary = getTextOnPrimary(primaryColor)
      
      const secondaryColor = companyData.secondary_color || null
      const secondaryHoverColor = secondaryColor ? getHoverColor(secondaryColor) : null
      
      const accentColor = companyData.accent_color || null
      const accentHoverColor = accentColor ? getHoverColor(accentColor) : null

      const brandData = {
        companyDisplayName: companyData.display_name || companyData.name || 'Company',
        logoUrl,
        primaryColor,
        primaryHoverColor,
        textOnPrimary,
        secondaryColor,
        secondaryHoverColor,
        accentColor,
        accentHoverColor,
      }

      setBrand(brandData)

      // Inject CSS variables
      const root = document.documentElement
      root.style.setProperty('--brand-primary', primaryColor)
      root.style.setProperty('--brand-primary-hover', primaryHoverColor)
      root.style.setProperty('--brand-on-primary', textOnPrimary)
      root.style.setProperty('--brand-name', `"${brandData.companyDisplayName}"`)
      root.style.setProperty('--brand-secondary', secondaryColor || primaryColor)
      root.style.setProperty('--brand-secondary-hover', secondaryHoverColor || primaryHoverColor)
      root.style.setProperty('--brand-accent', accentColor || primaryColor)
      root.style.setProperty('--brand-accent-hover', accentHoverColor || primaryHoverColor)
      if (logoUrl) {
        root.style.setProperty('--brand-logo-url', `url(${logoUrl})`)
      } else {
        root.style.removeProperty('--brand-logo-url')
      }
    } catch (err) {
      console.error('Error loading brand:', err)
      // Set defaults on error
      setBrand({
        companyDisplayName: 'Company',
        logoUrl: null,
        primaryColor: '#22c55e',
        primaryHoverColor: '#15803d',
        textOnPrimary: '#ffffff',
        secondaryColor: null,
        secondaryHoverColor: null,
        accentColor: null,
        accentHoverColor: null,
      })
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, publicToken, publicBrandData, loadPublicBrand, loadAuthenticatedBrand])

  // Load brand when dependencies change
  useEffect(() => {
    loadBrand()
  }, [loadBrand])

  // Expose refresh function
  const refreshBrand = useCallback(() => {
    loadBrand()
  }, [loadBrand])

  const value = {
    brand,
    loading,
    refreshBrand,
  }

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

/**
 * useBrand - Hook to access brand context
 */
export function useBrand() {
  const context = useContext(BrandContext)
  if (!context) {
    // Return safe defaults if used outside provider
    return {
      brand: {
        companyDisplayName: 'Company',
        logoUrl: null,
        primaryColor: '#22c55e',
        primaryHoverColor: '#15803d',
        textOnPrimary: '#ffffff',
        secondaryColor: null,
        secondaryHoverColor: null,
        accentColor: null,
        accentHoverColor: null,
      },
      loading: false,
      refreshBrand: () => {},
    }
  }
  return context
}
