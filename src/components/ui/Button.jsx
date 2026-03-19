/**
 * Button - Unified button component with consistent styling
 * 
 * Variants:
 * - primary: Green solid (bg-green-600)
 * - secondary: Slate solid (bg-slate-600)
 * - tertiary: Slate outline (border border-slate-400)
 * - danger: Red solid (bg-red-600)
 * 
 * Disabled state: opacity-50 + cursor-not-allowed (no hover styles)
 */
export default function Button({
  variant = "primary",
  disabled = false,
  className = "",
  children,
  ...rest
}) {
  // Base styles
  const baseClasses = "px-3 py-1 rounded text-sm font-medium transition";

  // Variant styles - use CSS variables for primary to support branding
  const variantClasses = {
    primary: "text-white",
    secondary: "bg-slate-600 text-white hover:bg-slate-700",
    tertiary: "border border-slate-400 text-slate-700 bg-white hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };

  // Inline styles for primary variant to use CSS variables
  const primaryStyle = variant === "primary" ? {
    backgroundColor: "var(--brand-primary, #22c55e)",
    color: "var(--brand-on-primary, #ffffff)",
  } : {};

  const primaryHoverStyle = variant === "primary" && !disabled ? {
    "--hover-bg": "var(--brand-primary-hover, #15803d)",
  } : {};

  // Get variant classes
  let classes = `${baseClasses} ${variantClasses[variant] || variantClasses.primary}`;

  // Add hover class for primary variant (using CSS variable)
  if (variant === "primary" && !disabled) {
    classes = `${classes} hover:opacity-90`;
  }

  // Handle disabled state
  if (disabled) {
    // Remove hover classes when disabled
    classes = classes.replace(/hover:\S+/g, "");
    // Add disabled styles
    classes = `${classes} opacity-50 cursor-not-allowed`;
  }

  // Merge with custom className
  const finalClasses = `${classes} ${className}`.trim();

  // Combine styles for primary variant
  const combinedStyle = variant === "primary" ? {
    ...primaryStyle,
    ...primaryHoverStyle,
    ...rest.style,
  } : rest.style;

  const { style: restStyle, onMouseEnter: restOnMouseEnter, onMouseLeave: restOnMouseLeave, ...restProps } = rest;

  return (
    <button
      disabled={disabled}
      className={finalClasses}
      style={combinedStyle}
      onMouseEnter={(e) => {
        if (variant === "primary" && !disabled) {
          e.currentTarget.style.backgroundColor = "var(--brand-primary-hover, #15803d)";
        }
        restOnMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (variant === "primary" && !disabled) {
          e.currentTarget.style.backgroundColor = "var(--brand-primary, #22c55e)";
        }
        restOnMouseLeave?.(e);
      }}
      {...restProps}
    >
      {children}
    </button>
  );
}

