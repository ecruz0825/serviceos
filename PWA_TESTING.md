# PWA Testing Guide

## Overview
The Crew Portal is now a Progressive Web App (PWA) with offline support, mobile-first design, and installable capabilities.

## Local Testing

### 1. Development Server
```bash
npm run dev
```

The PWA plugin is enabled in development mode. You can test:
- Service worker registration
- Manifest loading
- Offline functionality

### 2. Build and Preview
```bash
npm run build
npm run preview
```

This builds the production version with optimized service worker caching.

## Testing PWA Features

### Install Prompt
1. Open Chrome/Edge on desktop or Android
2. Navigate to `/crew/jobs`
3. Look for the install banner/prompt
4. Click "Install" to add to home screen

**Note:** iOS Safari doesn't support `beforeinstallprompt`. Users must manually:
1. Tap Share button
2. Select "Add to Home Screen"

### Offline Testing
1. Open DevTools (F12)
2. Go to Network tab
3. Enable "Offline" mode
4. Navigate to `/crew/jobs`
5. You should see cached jobs (if previously loaded)
6. Try uploading a photo (will queue for when online)

### Service Worker
1. Open DevTools → Application tab
2. Check "Service Workers" section
3. Verify service worker is registered and active
4. Check "Cache Storage" for cached assets
5. **IMPORTANT:** Verify Supabase API calls are NOT cached:
   - Open Network tab
   - Make API calls (e.g., load jobs)
   - Check that Supabase requests show "Network" not "Cache" in the Size column
   - Verify no cache entries for `*.supabase.co` domains

### Manifest
1. DevTools → Application → Manifest
2. Verify all fields are correct:
   - Name: "Lawn Care App - Crew Portal"
   - Start URL: "/crew/jobs"
   - Display: "standalone"
   - Icons: 192x192 and 512x512

## Production Testing

### HTTPS Required
PWAs require HTTPS in production. Ensure your hosting:
- Uses HTTPS
- Has valid SSL certificate
- Redirects HTTP to HTTPS

### Icon Generation
Before deploying, create PWA icons in `/public`:
- `pwa-192x192.png` (192x192px)
- `pwa-512x512.png` (512x512px)
- `apple-touch-icon.png` (180x180px)

**Quick Method (Recommended):**
1. Open `public/generate-icons.html` in your browser
2. Click the download buttons for each icon size
3. Save the files to `/public` directory

**Alternative Methods:**
- Online tools: https://realfavicongenerator.net/
- Design tools (Figma, Canva, etc.)
- Your brand logo resized

**Verify icons exist:**
```bash
node scripts/generate-pwa-icons.js
```
This will check if all required icons are present.

### Testing Checklist
- [ ] App installs on Chrome/Android
- [ ] App installs on iOS Safari (manual)
- [ ] Offline mode shows cached jobs
- [ ] Service worker caches assets (JS/CSS/icons only)
- [ ] **Supabase API calls are NOT cached** (verify in Network tab)
- [ ] Manifest validates correctly
- [ ] Icons display properly (all 3 sizes exist)
- [ ] Start URL loads correctly
- [ ] Theme color matches brand

## Mobile Testing

### Android (Chrome)
1. Open app in Chrome
2. Tap menu (3 dots)
3. Select "Install app" or "Add to Home screen"
4. App should open in standalone mode

### iOS (Safari)
1. Open app in Safari
2. Tap Share button (square with arrow)
3. Scroll and tap "Add to Home Screen"
4. Customize name if desired
5. Tap "Add"
6. App icon appears on home screen

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Verify HTTPS in production
- Clear browser cache and reload

### Install Prompt Not Showing
- Ensure you're on Chrome/Edge (not Safari)
- Check if app is already installed
- Verify manifest is valid
- Try in incognito mode

### Offline Not Working
- Ensure jobs were loaded at least once while online
- Check localStorage for cached data
- Verify service worker is active

### Icons Not Showing
- Verify icon files exist in `/public`
- Check manifest icon paths are correct
- Ensure icons are proper size and format (PNG)

## Browser Support

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| Install Prompt | ✅ | ✅ | ❌ | ⚠️ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Offline Cache | ✅ | ✅ | ✅ | ✅ |
| Add to Home Screen | ✅ | ✅ | ✅ | ✅ |

## Testing Realtime Updates

The Crew Portal uses Supabase Realtime to provide live updates when jobs are assigned, scheduled, or modified.

### Setup
1. Ensure you have two browser windows/tabs open:
   - **Window 1:** Admin Portal (logged in as admin/manager)
   - **Window 2:** Crew Portal (logged in as crew member)

### Test Scenarios

#### 1. New Job Assignment
1. In **Admin Portal**, create or edit a job
2. Assign the job to a team that includes the crew member from **Window 2**
3. **Expected in Crew Portal:**
   - Toast notification: "New job assigned: [Job Name]"
   - "Updates" badge appears in header with count
   - Job list refreshes automatically (debounced ~500ms)
   - New job appears in appropriate tab (Today/Upcoming)

#### 2. Schedule Change
1. In **Admin Portal**, edit a job assigned to the crew member's team
2. Change the `service_date` or `scheduled_end_date`
3. **Expected in Crew Portal:**
   - Toast notification: "Job schedule updated"
   - "Updates" badge increments
   - Job list refreshes with new schedule

#### 3. Job Unassignment
1. In **Admin Portal**, edit a job assigned to the crew member's team
2. Change `assigned_team_id` to a different team (or null)
3. **Expected in Crew Portal:**
   - Toast notification: "Job unassigned from your team"
   - "Updates" badge increments
   - Job disappears from the list

#### 4. Job Detail Update Banner
1. In **Crew Portal**, navigate to a job detail page (`/crew/job/:id`)
2. In **Admin Portal**, update that same job (change date, status, etc.)
3. **Expected in Crew Portal:**
   - Blue banner appears: "This job was updated — tap to refresh"
   - Clicking "Refresh" button reloads the job with latest data

#### 5. Updates Badge Interaction
1. Trigger multiple updates quickly (assign multiple jobs, change schedules)
2. **Expected:**
   - "Updates" badge shows count (e.g., "3")
   - Multiple events are debounced into a single refetch
   - Clicking the badge:
     - Clears the count
     - Triggers a full refresh with loading indicator
     - Job list updates

#### 6. Offline Behavior
1. In **Crew Portal**, go offline (DevTools → Network → Offline)
2. In **Admin Portal**, assign a new job to the crew member's team
3. **Expected in Crew Portal:**
   - "Updates" badge increments (even though offline)
   - No refetch attempt (saves bandwidth)
   - Toast/notification may not appear (depends on connection)
4. Go back online
5. **Expected:**
   - Toast: "Back online! Syncing..."
   - Automatic refetch occurs
   - Badge count resets
   - New job appears

### Verification Checklist
- [ ] New job assignment shows toast + badge
- [ ] Schedule changes show toast + badge
- [ ] Job unassignment shows toast + badge
- [ ] Updates badge increments correctly
- [ ] Clicking badge refreshes list
- [ ] Multiple rapid updates are debounced (single refetch)
- [ ] Job detail page shows update banner when job changes
- [ ] Offline mode increments badge but doesn't refetch
- [ ] Reconnect triggers auto-refetch
- [ ] No duplicate subscriptions (check console for errors)
- [ ] No memory leaks (unsubscribe on unmount)
- [ ] No infinite refetch loops

### Debugging Realtime
1. **Check subscription status:**
   - Open browser console
   - Look for: "✅ Realtime subscription active"
   - If you see "❌ Realtime subscription error", check:
     - Supabase Realtime is enabled for your project
     - RLS policies allow the crew member to read jobs
     - Network connection is stable

2. **Verify events are received:**
   - Open browser console
   - Watch for realtime events (they're logged internally)
   - Check Network tab for WebSocket connections to Supabase

3. **Test subscription cleanup:**
   - Navigate to Crew Portal
   - Check DevTools → Application → Service Workers
   - Navigate away from Crew Portal
   - Verify no console errors about unclosed subscriptions

## Testing Job Sessions

The Crew Portal includes job session tracking to monitor execution time and workflow.

### Setup
1. Ensure you have a job assigned to a crew member's team
2. Open the Crew Portal as that crew member
3. Navigate to the "Today" tab

### Test Scenarios

#### 1. Start Job Session
1. In **Crew Portal**, find a job that hasn't been started
2. Click "Start Job" button
3. **Expected:**
   - Toast notification: "Job session started"
   - Job card shows "Running: 00:00" (elapsed time)
   - Elapsed time updates every 30 seconds
   - Job detail page shows "Started At" timestamp
   - "Start Job" button is replaced with photo upload/complete buttons

#### 2. Elapsed Time Display
1. Start a job session
2. Wait 1-2 minutes
3. **Expected:**
   - Elapsed time updates: "Running: 01:30" (minutes:seconds)
   - Timer continues running while job is in progress
   - Timer stops when job is completed

#### 3. Stop Job Without Photos (Should Fail)
1. Start a job session
2. Click "Complete Job Session" without uploading before/after photos
3. **Expected:**
   - Toast error: "Before and after photos are required to complete the job"
   - Job remains in "in progress" state
   - `completed_at` is NOT set

#### 4. Stop Job With Photos (Success)
1. Start a job session
2. Upload before photo
3. Upload after photo
4. Click "Complete Job Session"
5. **Expected:**
   - Toast notification: "Job session completed"
   - Job shows "Completed" status
   - Job detail shows "Started At" and "Completed At" timestamps
   - Duration is calculated and displayed
   - Elapsed timer stops

#### 5. Idempotency (Double Start)
1. Start a job session
2. Click "Start Job" again immediately
3. **Expected:**
   - No error (idempotent)
   - `started_at` timestamp remains unchanged
   - Toast may show "Job session already started" or similar

#### 6. Auto-Start on Stop (Professional Behavior)
1. Skip "Start Job" button
2. Upload before and after photos
3. Click "Complete Job Session"
4. **Expected:**
   - `started_at` is automatically set to current time
   - `completed_at` is set immediately after
   - Duration shows 0:00 or very short duration

#### 7. Realtime Updates
1. In **Crew Portal**, start a job session
2. In **Admin Portal** (or another browser), manually update the job's `started_at` or `completed_at`
3. **Expected in Crew Portal:**
   - "Updates" badge appears
   - Job list refreshes automatically
   - Elapsed time updates reflect new state

#### 8. Session State Display
1. Check job cards in different states:
   - **Not started:** Shows "Not started" text
   - **In progress:** Shows "Running: MM:SS" with live timer
   - **Completed:** Shows "Completed" text
2. **Expected:**
   - States are clearly distinguishable
   - Visual indicators match job state

### Verification Checklist
- [ ] Start job sets `started_at` timestamp
- [ ] Elapsed timer runs and updates every 30 seconds
- [ ] Stop job without photos is blocked
- [ ] Stop job with photos sets `completed_at` and status
- [ ] Duration is calculated correctly
- [ ] Idempotency works (double start doesn't change timestamp)
- [ ] Auto-start on stop works (sets started_at if null)
- [ ] Realtime updates trigger badge and refresh
- [ ] Session state displays correctly in job cards
- [ ] Timestamps show in job detail page
- [ ] No race conditions (multiple rapid taps handled gracefully)

### Admin Verification
1. In **Admin Portal**, view the Jobs list
2. Check jobs that have been started/completed
3. **Expected:**
   - `started_at` and `completed_at` columns are visible (if JobsAdmin displays them)
   - Timestamps are accurate
   - Duration can be calculated from timestamps

### Debugging Sessions
1. **Check RPC execution:**
   - Open browser console
   - Look for RPC call errors
   - Verify tenant isolation (can't start jobs from other companies)

2. **Verify database:**
   - Check `jobs.started_at` and `jobs.completed_at` columns
   - Verify audit logs in `audit_log` table:
     - Action: `job_session_started` or `job_session_stopped`
     - Metadata includes duration_seconds

3. **Test edge cases:**
   - Start job, then try to start again (idempotent)
   - Complete job, then try to start again (should fail)
   - Complete job without photos (should fail with clear error)

## Phase 4 — Crew Notes + Job Issue Flags + RevenueHub "Needs Attention" Queue

### Testing Crew Notes
1. **As Crew:**
   - Navigate to a job assigned to your team
   - Scroll to "Notes & Issues" section
   - Add a note: "Customer requested early morning service"
   - Verify note appears in "Notes History" immediately
   - Verify note shows timestamp

2. **As Admin:**
   - Navigate to same job
   - Verify you can see the note added by crew
   - Add your own note: "Scheduled for 7 AM"
   - Verify both notes appear in chronological order (newest first)

### Testing Job Issue Flags
1. **As Crew:**
   - Navigate to a job assigned to your team
   - Scroll to "Flag Issue" form
   - Select Category: "Access", Severity: "High", Message: "Gate code not working"
   - Click "Flag Issue"
   - Verify success toast appears
   - Verify flag appears in "Open Issues" alert box at top of Notes & Issues section
   - Verify flag shows severity badge (red for high)

2. **As Admin:**
   - Navigate to RevenueHub
   - Verify "Needs Attention" queue card appears
   - Verify job with flag appears in queue
   - Verify flag details show: severity badge, category, message
   - Click "Resolve" button
   - Verify success toast appears
   - Verify job disappears from "Needs Attention" queue
   - Navigate back to job detail (as crew)
   - Verify flag no longer appears in "Open Issues" (resolved flags are hidden)

3. **Realtime Badge Update:**
   - As crew, flag an issue on a job
   - As admin, open RevenueHub in another tab/window
   - As admin, resolve the flag
   - Verify "Needs Attention" badge count decreases in realtime (if realtime subscription is active)

### Testing Access Control
1. **Crew Access:**
   - As crew, try to add note to job NOT assigned to your team
   - Verify error: "You do not have permission to add notes for this job"
   - Try to flag issue on job NOT assigned to your team
   - Verify error: "You do not have permission to flag issues for this job"

2. **Admin Access:**
   - As admin, verify you can add notes to any job in your company
   - As admin, verify you can flag issues on any job
   - As admin, verify you can resolve flags on any job

### Testing Edge Cases
1. **Empty States:**
   - Job with no notes: verify "Notes History" section doesn't show
   - Job with no flags: verify "Open Issues" alert doesn't show
   - No jobs with flags: verify "Needs Attention" queue shows "No jobs need attention"

2. **Multiple Flags:**
   - Flag multiple issues on same job (different categories/severities)
   - Verify all flags appear in "Open Issues" alert
   - Verify highest severity is used for sorting in RevenueHub
   - Resolve one flag: verify others remain visible

3. **Flag Categories:**
   - Test all categories: access, equipment, scope, safety, customer, other
   - Verify category appears correctly in UI

4. **Flag Severities:**
   - Test all severities: low (yellow), medium (orange), high (red)
   - Verify color coding appears correctly in both CrewJobDetail and RevenueHub

## Additional Resources
- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev PWA](https://web.dev/progressive-web-apps/)
- [vite-plugin-pwa Docs](https://vite-pwa-org.netlify.app/)
- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)