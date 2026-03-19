import { BrandProvider, useBrand } from '../context/BrandContext'

/**
 * PublicLayout - Shared layout wrapper for public-facing pages
 * 
 * Provides:
 * - BrandProvider wrapper with token-based branding
 * - Consistent header (logo, company name, address, support info)
 * - Consistent footer
 * 
 * Props:
 * - token: Public token for brand lookup
 * - company: Company data object (optional, from quote RPC response)
 * - children: Page content
 */
function PublicLayoutContent({ children, company }) {
  const { brand } = useBrand()

  const companyName = brand?.companyDisplayName || company?.company_display_name || company?.display_name || company?.company_name || company?.name || 'Your Company'
  const companyAddress = company?.company_address || company?.address || null
  const supportPhone = company?.company_support_phone || company?.support_phone || null
  const supportEmail = company?.company_support_email || company?.support_email || null
  const logoUrl = brand?.logoUrl || null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt={companyName}
                className="h-10 w-10 object-contain"
              />
            )}
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-900">{companyName}</h1>
              {companyAddress && (
                <p className="text-sm text-slate-600 mt-0.5">{companyAddress}</p>
              )}
              {(supportPhone || supportEmail) && (
                <div className="mt-1 text-xs text-slate-600">
                  {supportPhone && <span>Phone: {supportPhone}</span>}
                  {supportPhone && supportEmail && <span className="mx-2">•</span>}
                  {supportEmail && <span>Email: {supportEmail}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-xs text-slate-500 text-center">
          Powered by {companyName}
        </div>
      </footer>
    </div>
  )
}

export default function PublicLayout({ token, company = null, children }) {
  // Map company prop to publicBrandData format
  const publicBrandData = company ? {
    display_name: company.company_display_name || company.display_name || company.name || company.company_name || null,
    name: company.company_name || company.name || null,
    logo_path: company.company_logo_path || company.logo_path || null,
    primary_color: company.company_primary_color || company.primary_color || null,
    secondary_color: company.company_secondary_color || company.secondary_color || null,
    accent_color: company.company_accent_color || company.accent_color || null,
  } : null

  return (
    <BrandProvider publicToken={token} publicBrandData={publicBrandData}>
      <PublicLayoutContent company={company}>
        {children}
      </PublicLayoutContent>
    </BrandProvider>
  )
}
