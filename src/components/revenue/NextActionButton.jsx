/**
 * NextActionButton - Single primary action button for pipeline items
 * Takes nextAction object from getNextAction() or nextActionEngine and navigates on click
 * Supports both old format (href) and new format (route)
 */

import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'

export default function NextActionButton({ nextAction, size = 'sm' }) {
  const navigate = useNavigate()
  
  if (!nextAction) {
    return null
  }
  
  const handleClick = () => {
    // Support both old format (href) and new format (route)
    const route = nextAction.route || nextAction.href
    if (route) {
      navigate(route)
    }
  }
  
  // Use kind to determine variant, fallback to primary
  const variant = nextAction.kind === 'secondary' ? 'secondary' : 'primary'
  
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
    >
      {nextAction.label}
    </Button>
  )
}
