# Branding Replacement Report
## Removing "LawnCare" and Lawn-Specific References

### Summary
Replaced user-facing "LawnCare" references and lawn-specific wording with generic, industry-neutral terms. Only UI strings, email templates, and PDF headers were modified. No file renames, route renames, or database changes.

---

## Files Changed

### 1. `src/components/nav/Sidebar.jsx`
**Line 11**
- **Before:** `const brandName = settings?.display_name || "LawnCare App";`
- **After:** `const brandName = settings?.display_name || "ServiceOps";`
- **Context:** Default brand name fallback in sidebar navigation

### 2. `src/Navbar.jsx`
**Line 13**
- **Before:** `const appTitle = settings?.display_name || "LawnCare App";`
- **After:** `const appTitle = settings?.display_name || "ServiceOps";`
- **Context:** Default app title fallback in navbar (also sets document.title)

### 3. `src/utils/ics.js`
**Line 29**
- **Before:** `const title = \`${companyName || "LawnCare"} – ${job?.services_performed || "Service"}\`;`
- **After:** `const title = \`${companyName || "ServiceOps"} – ${job?.services_performed || "Service"}\`;`
- **Context:** ICS calendar event title fallback (user-visible in calendar apps)

### 4. `src/utils/gcal.js`
**Line 24**
- **Before:** `const title = \`${companyName || "LawnCare"} – ${job.services_performed || "Service"}\`;`
- **After:** `const title = \`${companyName || "ServiceOps"} – ${job.services_performed || "Service"}\`;`
- **Context:** Google Calendar event title fallback (user-visible in Google Calendar)

### 5. `src/pages/admin/Settings.jsx`
**Line 269**
- **Before:** `placeholder="e.g., GreenCo Lawn Care"`
- **After:** `placeholder="e.g., ServiceOps"`
- **Context:** Placeholder text in company display name input field

### 6. `src/pages/admin/JobsAdmin.jsx`
**Line 1504**
- **Before:** `placeholder="Lawn Mowing, Fertilization, etc."`
- **After:** `placeholder="Service Type, Service Type, etc."`
- **Context:** Placeholder text in service type input field

---

## Replacement Rules Applied

1. **"LawnCare App"** → **"ServiceOps"** (default app/brand name)
2. **"LawnCare"** → **"ServiceOps"** (default company name in calendar events)
3. **"GreenCo Lawn Care"** → **"ServiceOps"** (example placeholder)
4. **"Lawn Mowing, Fertilization, etc."** → **"Service Type, Service Type, etc."** (generic service placeholder)

---

## Files NOT Changed (Verified)

- **Email templates** - Already use generic terms ("service", "Service", etc.)
- **PDF generators** - Use company settings or generic "Your Company" fallback
- **Variable names** - All code identifiers remain unchanged
- **Component names** - All component/file names remain unchanged
- **Routes** - All route paths remain unchanged
- **Database** - No schema or data changes

---

## Build Status
✅ **Build passes** - All changes compile successfully
✅ **No linting errors** - Code quality maintained
✅ **No breaking changes** - Only user-visible strings modified

---

## Notes

- All replacements maintain the same fallback pattern (using `||` operator)
- Generic terms chosen: "ServiceOps" for branding, "Service Type" for service examples
- Email templates were already industry-neutral and required no changes
- PDF generators use company settings from database, so no hardcoded branding found

