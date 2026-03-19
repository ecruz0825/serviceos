# Phase A.1 Step 3: BillingGuard Usage Notes

**Component:** `src/components/ui/BillingGuard.jsx`  
**Hook:** `src/hooks/useBillingGate.js` (used internally)

---

## Component API

### `BillingGuard` Component

**Props:**
- `children` (required): React node(s) to wrap
- `showTooltip` (optional, default: `true`): Show tooltip with read-only reason on hover when disabled
- `className` (optional): Additional CSS classes for wrapper when disabled

**Behavior:**
- When `canWrite === true`: Renders children normally (no wrapper)
- When `canWrite === false`: 
  - For buttons: Adds `disabled={true}` prop and optional `title` tooltip
  - For other elements: Wraps in div with `pointer-events: none`, `opacity: 0.5`, and optional `title` tooltip

---

## Recommended Usage Patterns

### Pattern 1: Single Button

Wrap a single button with `BillingGuard`:

```jsx
import BillingGuard from '../../components/ui/BillingGuard';
import Button from '../../components/ui/Button';

<BillingGuard>
  <Button onClick={handleSave}>Save Changes</Button>
</BillingGuard>
```

**Result when read-only:**
- Button is disabled
- Tooltip shows read-only reason on hover
- Button styling shows disabled state (opacity, cursor)

---

### Pattern 2: Button Row / Action Group

Wrap multiple buttons in a single `BillingGuard`:

```jsx
<BillingGuard>
  <div className="flex gap-2">
    <Button onClick={handleCreate}>Create</Button>
    <Button onClick={handleUpdate} variant="secondary">Update</Button>
    <Button onClick={handleDelete} variant="danger">Delete</Button>
  </div>
</BillingGuard>
```

**Result when read-only:**
- All buttons are wrapped in disabled container
- Pointer events blocked on entire group
- Tooltip shows on hover over the group

**Note:** For better UX, you may want to wrap each button individually if you need per-button tooltips.

---

### Pattern 3: Form Action Area

Wrap form submit buttons and actions:

```jsx
<Card>
  <form onSubmit={handleSubmit}>
    {/* Form fields */}
    
    <div className="mt-4 flex gap-2">
      <BillingGuard>
        <Button type="submit">Save Settings</Button>
      </BillingGuard>
      <Button type="button" variant="tertiary" onClick={handleCancel}>
        Cancel
      </Button>
    </div>
  </form>
</Card>
```

**Result when read-only:**
- Submit button is disabled
- Cancel button remains enabled (not wrapped)
- Tooltip shows on submit button hover

---

### Pattern 4: Inline Hook Usage (Alternative)

For cases where you need more control, use the `useBillingGuard` hook directly:

```jsx
import { useBillingGuard } from '../../components/ui/BillingGuard';
import Button from '../../components/ui/Button';

function MyComponent() {
  const { disabled, reason } = useBillingGuard();
  const [saving, setSaving] = useState(false);
  
  return (
    <Button 
      disabled={disabled || saving}
      title={disabled ? reason : undefined}
      onClick={handleSave}
    >
      {saving ? 'Saving...' : 'Save'}
    </Button>
  );
}
```

**When to use:**
- You need to combine billing guard with other disabled conditions
- You want custom disabled styling or behavior
- You're working with non-standard button components

---

## Limitations

### 1. Button Component Detection

`BillingGuard` attempts to detect button elements by:
- Native `<button>` elements
- Components named `Button` or with `displayName === 'Button'`

**If your button component doesn't match:**
- Use `useBillingGuard` hook instead
- Or manually pass `disabled` prop based on `useBillingGate().canWrite`

### 2. Complex Children

When wrapping multiple children or complex trees:
- All children are wrapped in a single disabled container
- Individual child props are not modified (except for detected buttons)
- For per-element control, wrap each element individually

### 3. Form Elements

For `<input>`, `<select>`, `<textarea>`:
- They are wrapped in disabled container (pointer-events blocked)
- They do NOT receive `disabled` prop automatically
- For proper form behavior, use `useBillingGuard` hook and pass `disabled` prop directly

**Example:**
```jsx
const { disabled } = useBillingGuard();
<input disabled={disabled} ... />
```

### 4. Links That Act Like Buttons

For `<Link>` or `<a>` elements styled as buttons:
- They are wrapped in disabled container
- They do NOT receive `disabled` prop (links don't support it)
- Consider using `Button` component with `as={Link}` pattern if available
- Or use `useBillingGuard` hook and conditionally render Link vs disabled button

---

## Best Practices

1. **Wrap at the action level**: Wrap buttons/actions, not entire forms or pages
2. **Combine with other guards**: Use `useBillingGuard` hook when you need to combine with `supportMode` or other disabled conditions
3. **Keep tooltips enabled**: Default `showTooltip={true}` provides good UX
4. **Test both states**: Verify behavior when `canWrite === true` and `canWrite === false`

---

## Integration Checklist

When adding billing guards to a page:

- [ ] Import `BillingGuard` or `useBillingGuard`
- [ ] Identify all mutation actions (create, update, delete, submit)
- [ ] Wrap each action with `BillingGuard` or use hook
- [ ] Test with `unpaid` subscription status
- [ ] Test with `canceled` subscription status
- [ ] Test with `active` subscription status (should work normally)
- [ ] Verify tooltips show correct messages
- [ ] Verify disabled styling is visible

---

## Examples from Codebase

### Example 1: Simple Button Guard
```jsx
// Before
<Button onClick={handleCreate}>Create Job</Button>

// After
<BillingGuard>
  <Button onClick={handleCreate}>Create Job</Button>
</BillingGuard>
```

### Example 2: Combined Guards
```jsx
// Before
<Button disabled={supportMode} onClick={handleSave}>Save</Button>

// After
const { disabled: billingDisabled } = useBillingGuard();
<Button disabled={supportMode || billingDisabled} onClick={handleSave}>Save</Button>
```

### Example 3: Form Actions
```jsx
// Before
<div className="flex gap-2">
  <Button type="submit">Save</Button>
  <Button type="button" variant="tertiary">Cancel</Button>
</div>

// After
<div className="flex gap-2">
  <BillingGuard>
    <Button type="submit">Save</Button>
  </BillingGuard>
  <Button type="button" variant="tertiary">Cancel</Button>
</div>
```
