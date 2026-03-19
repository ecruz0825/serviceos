import { Clock } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

/**
 * TimelineEmptyState - Empty state for customer timeline
 */
export default function TimelineEmptyState() {
  return (
    <EmptyState
      icon={Clock}
      title="No activity yet."
      description="Customer events will appear here as you create jobs, quotes, and notes."
    />
  );
}
