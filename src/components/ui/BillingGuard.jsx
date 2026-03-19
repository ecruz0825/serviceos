// src/components/ui/BillingGuard.jsx
// Reusable wrapper for mutation controls that enforces billing read-only mode
// Phase A.1 - Billing Entitlement Enforcement

import { useBillingGate } from "../../hooks/useBillingGate";
import { cloneElement, isValidElement } from "react";

/**
 * BillingGuard - Wraps mutation controls to disable them when billing is read-only
 * 
 * Usage:
 *   <BillingGuard>
 *     <Button onClick={handleSave}>Save</Button>
 *   </BillingGuard>
 * 
 * When canWrite is false:
 *   - Buttons receive disabled prop
 *   - Other elements are wrapped in a disabled container
 *   - Pointer events are blocked
 *   - Tooltip shows read-only reason
 * 
 * Props:
 *   - children: React node(s) to wrap
 *   - showTooltip: boolean (default: true) - Show tooltip on hover when disabled
 *   - className: string - Additional classes for wrapper when disabled
 */
export default function BillingGuard({ 
  children, 
  showTooltip = true,
  className = "" 
}) {
  const { canWrite, readOnlyReason } = useBillingGate();

  // If write is allowed, render children normally
  if (canWrite) {
    return <>{children}</>;
  }

  // Write is blocked: disable children
  // Handle single child (most common case)
  if (isValidElement(children)) {
    // If it's a button-like element, add disabled prop
    if (children.type === 'button' || 
        (typeof children.type === 'function' && 
         (children.type.name === 'Button' || children.type.displayName === 'Button'))) {
      return cloneElement(children, {
        ...children.props,
        disabled: true,
        title: showTooltip ? readOnlyReason : (children.props.title || undefined)
      });
    }

    // For other elements, wrap in disabled container
    return (
      <div 
        className={`inline-block ${className}`}
        style={{ pointerEvents: 'none', opacity: 0.5 }}
        title={showTooltip ? readOnlyReason : undefined}
      >
        {children}
      </div>
    );
  }

  // Multiple children: wrap all in disabled container
  return (
    <div 
      className={`inline-block ${className}`}
      style={{ pointerEvents: 'none', opacity: 0.5 }}
      title={showTooltip ? readOnlyReason : undefined}
    >
      {children}
    </div>
  );
}

/**
 * useBillingGuard - Hook that returns disabled state and reason for inline use
 * 
 * Usage:
 *   const { disabled, reason } = useBillingGuard();
 *   <Button disabled={disabled || otherDisabled} title={reason}>Save</Button>
 * 
 * Returns:
 *   - disabled: boolean - true when billing blocks writes
 *   - reason: string - read-only reason message (or empty string)
 */
export function useBillingGuard() {
  const { canWrite, readOnlyReason } = useBillingGate();
  
  return {
    disabled: !canWrite,
    reason: readOnlyReason || ''
  };
}
