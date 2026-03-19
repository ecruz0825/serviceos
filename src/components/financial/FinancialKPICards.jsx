import CustomerKPICard from '../customers/CustomerKPICard';

/**
 * FinancialKPICards - Wrapper component for financial KPI cards
 * Reuses CustomerKPICard component for consistency
 * 
 * @param {Object} props
 * @param {Object} props.data - KPI data object
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message (optional)
 * @param {Array<string>} props.types - Array of KPI types to display (default: ['totalPaid', 'outstanding', 'jobs', 'lastActivity'])
 * @param {string} props.className - Additional CSS classes for container
 */
export default function FinancialKPICards({ 
  data, 
  loading, 
  error,
  types = ['totalPaid', 'outstanding', 'jobs', 'lastActivity'],
  className = ""
}) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`}>
      {types.map(type => (
        <CustomerKPICard
          key={type}
          type={type}
          data={data}
          loading={loading}
          error={error}
        />
      ))}
    </div>
  );
}
