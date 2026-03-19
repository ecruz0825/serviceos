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
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

