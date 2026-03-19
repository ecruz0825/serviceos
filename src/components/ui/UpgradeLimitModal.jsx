// src/components/ui/UpgradeLimitModal.jsx
// Modal for displaying plan limit warnings with upgrade CTA

import { useEffect } from 'react';
import Button from './Button';
import { logProductEvent } from '../../lib/productEvents';

/**
 * UpgradeLimitModal - Modal for plan limit warnings
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - limitType: 'crew' | 'customers' | 'jobs' - Type of limit
 * - currentUsage: number - Current usage count
 * - limit: number - Plan limit
 * - plan: string - Current plan code
 * - onUpgrade: function - Called when upgrade button clicked
 * - onCancel: function - Called when user cancels/closes
 */
export default function UpgradeLimitModal({
  open,
  limitType,
  currentUsage,
  limit,
  plan,
  onUpgrade,
  onCancel
}) {
  // Handle ESC key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onCancel]);

  // Log telemetry when modal is shown (wrapped in try/catch to never block core actions)
  useEffect(() => {
    if (open) {
      try {
        logProductEvent('limit_warning_shown', {
          limit_type: limitType,
          current_usage: currentUsage,
          limit: limit,
          plan: plan
        });
      } catch (e) {
        console.warn('[UpgradeLimitModal] Product event logging failed:', e);
        // Continue - analytics failures must never block core actions
      }
    }
  }, [open, limitType, currentUsage, limit, plan]);

  if (!open) return null;

  // Friendly messages based on limit type
  const messages = {
    crew: {
      title: 'Crew Limit Reached',
      message: `${plan === 'starter' ? 'Starter' : 'Your current'} plan allows ${limit} crew ${limit === 1 ? 'member' : 'members'}.`,
      upgradeMessage: 'Upgrade to Pro for unlimited crew members.'
    },
    customers: {
      title: 'Customer Limit Reached',
      message: `${plan === 'starter' ? 'Starter' : 'Your current'} plan allows ${limit} ${limit === 1 ? 'customer' : 'customers'}.`,
      upgradeMessage: 'Upgrade to Pro for unlimited customers.'
    },
    jobs: {
      title: 'Monthly Job Limit Reached',
      message: `${plan === 'starter' ? 'Starter' : 'Your current'} plan allows ${limit} ${limit === 1 ? 'job' : 'jobs'} per month.`,
      upgradeMessage: 'Upgrade to Pro for unlimited jobs per month.'
    }
  };

  const config = messages[limitType] || messages.crew;

  const handleUpgrade = () => {
    try {
      logProductEvent('upgrade_cta_clicked', {
        limit_type: limitType,
        current_usage: currentUsage,
        limit: limit,
        plan: plan
      });
    } catch (e) {
      console.warn('[UpgradeLimitModal] Product event logging failed:', e);
      // Continue - analytics failures must never block core actions
    }
    onUpgrade();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" />

      {/* Modal Card */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 z-[10000]">
        <div className="p-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {config.title}
          </h3>

          {/* Message */}
          <div className="text-sm text-gray-600 mb-2">
            {config.message}
          </div>
          <div className="text-sm text-gray-600 mb-6">
            {config.upgradeMessage}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpgrade}
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
