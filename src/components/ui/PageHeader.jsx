/**
 * PageHeader - Standardized page header component
 * 
 * @param {Object} props
 * @param {string} props.title - Main page title
 * @param {string} [props.subtitle] - Optional subtitle text
 * @param {React.ReactNode} [props.actions] - Optional action buttons/elements
 */
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 truncate">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1 break-words">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}

