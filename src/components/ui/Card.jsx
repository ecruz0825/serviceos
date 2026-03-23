/**
 * Card - Standardized card component for content containers
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {boolean} [props.clickable] - Whether the card should have hover/click styles
 * @param {Function} [props.onClick] - Optional click handler
 */
export default function Card({ children, clickable = false, onClick }) {
  return (
    <div
      className={`
        bg-white border border-slate-200 rounded-xl shadow-sm p-5
        min-w-0 max-w-full
        ${clickable ? "transition-shadow hover:shadow-md cursor-pointer" : ""}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

