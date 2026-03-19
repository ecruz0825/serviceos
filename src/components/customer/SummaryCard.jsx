import { useBrand } from '../../context/BrandContext'
import Card from '../ui/Card'

/**
 * SummaryCard - Dashboard summary card with brand colors
 */
export default function SummaryCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  trend,
  onClick 
}) {
  const { brand } = useBrand()
  const primaryColor = brand?.primaryColor || '#22c55e'

  const cardContent = (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
        <p 
          className="text-2xl font-bold mb-1"
          style={{ color: primaryColor }}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-slate-500">{subtitle}</p>
        )}
        {trend && (
          <p className={`text-xs mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </p>
        )}
      </div>
      {Icon && (
        <div 
          className="p-3 rounded-lg"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Icon 
            className="h-6 w-6" 
            style={{ color: primaryColor }}
          />
        </div>
      )}
    </div>
  )

  if (onClick) {
    return (
      <Card 
        clickable 
        onClick={onClick}
        className="hover:shadow-md transition-shadow cursor-pointer"
      >
        {cardContent}
      </Card>
    )
  }

  return <Card>{cardContent}</Card>
}
