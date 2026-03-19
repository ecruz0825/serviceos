# Backup Procedure

This document outlines the backup and restore procedures for the LawnCare App database.

## Overview

The application uses Supabase for database hosting, which provides automated backups and point-in-time recovery (PITR) capabilities.

## Manual Backup Triggers

### Via Supabase Dashboard

1. Navigate to your Supabase project dashboard
2. Go to **Settings** → **Database** → **Backups**
3. Click **"Create Backup"** to trigger an immediate full backup
4. The backup will appear in the backups list with a timestamp

### Via Supabase CLI

```bash
# Create a manual backup
supabase db dump -f backups/manual-$(Get-Date -Format "yyyy-MM-dd__HH-mm").sql
```

## Automated Backups

### Daily Full Backups

Supabase automatically creates daily full backups. These are retained for:
- **7 days** of daily backups
- **4 weeks** of weekly backups
- **12 months** of monthly backups

### Accessing Automated Backups

1. Go to Supabase Dashboard → **Settings** → **Database** → **Backups**
2. Find the backup by date/time
3. Click **"Download"** to save locally
4. Backups are in SQL format and can be restored using `psql` or Supabase CLI

## Restore Procedures

### Restore to Staging Environment

1. **Download the backup file** from Supabase Dashboard
2. **Connect to staging database:**
   ```bash
   # Get staging connection string from Supabase Dashboard
   # Settings → Database → Connection string
   ```
3. **Restore the backup:**
   ```bash
   # Using psql
   psql -h <staging-host> -U postgres -d postgres < backup-file.sql
   
   # Or using Supabase CLI (if staging is a Supabase project)
   supabase db reset --db-url <staging-connection-string>
   psql <staging-connection-string> < backup-file.sql
   ```
4. **Verify restore:**
   - Check row counts in key tables
   - Verify company data exists
   - Test authentication

### Point-in-Time Restore (PITR)

Supabase supports point-in-time recovery for the last 7 days.

1. Go to Supabase Dashboard → **Settings** → **Database** → **Backups**
2. Click **"Point-in-time Recovery"**
3. Select the target time (must be within last 7 days)
4. Choose restore destination:
   - **New project** (recommended for testing)
   - **Current project** (⚠️ destructive - use with caution)
5. Confirm restore
6. Wait for restore to complete (may take 10-30 minutes)

**Note:** PITR creates a new project by default. You can then:
- Export data from the restored project
- Import into your staging/production project
- Or use the restored project as a temporary staging environment

## Recommended Backup Schedule

### Daily
- ✅ Automated by Supabase (no action needed)
- Verify backup completion in dashboard weekly

### Weekly
- **Offsite Export:** Download latest backup and store in:
  - Cloud storage (S3, Google Drive, etc.)
  - Local encrypted storage
  - Offsite backup service
- **Verification:** Test restore to staging environment monthly

### Monthly
- **Archive:** Download monthly backup and archive to long-term storage
- **Documentation:** Update backup log with:
  - Backup date/time
  - Backup size
  - Restore test results
  - Any issues encountered

## Backup Verification Checklist

Before considering a backup "good", verify:

- [ ] Backup file size is reasonable (> 1MB for production)
- [ ] Backup contains expected tables (quotes, jobs, customers, etc.)
- [ ] Backup can be restored to a test database
- [ ] Restored database has correct row counts
- [ ] Authentication works in restored database
- [ ] RLS policies are intact

## Emergency Restore Procedure

If production database is corrupted or lost:

1. **Stop all application traffic** (if possible)
2. **Assess damage:** Determine if PITR or full restore is needed
3. **Choose restore point:** Use most recent backup before corruption
4. **Restore to new project** (never restore directly to production)
5. **Verify restore** in new project
6. **Export from restored project** to SQL file
7. **Import to production** (after confirming restore is good)
8. **Resume application traffic**

## Backup Storage Locations

- **Supabase Cloud:** Automated backups (7 days daily, 4 weeks weekly, 12 months monthly)
- **Local:** `/backups` folder (via export script)
- **Offsite:** Cloud storage (weekly exports)
- **Archive:** Long-term storage (monthly exports)

## Related Documentation

- [Staging Environment Setup](./staging-environment.md)
- [Database Export Script](../../scripts/export-db.ps1)
