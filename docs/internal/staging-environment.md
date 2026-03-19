# Staging Environment Setup

This document outlines how to set up and maintain a staging environment that mirrors production.

## Overview

The staging environment should be a close replica of production, used for:
- Testing migrations before production deployment
- Validating new features
- Testing invoice lifecycle and payment flows
- Verifying rate limiting and security features
- Demo purposes

## Initial Setup

### 1. Create Staging Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Name it: `lawncare-app-staging`
4. Choose a region close to your production region
5. Set a strong database password
6. Wait for project to be provisioned (~2 minutes)

### 2. Environment Variable Mapping

Create a `.env.staging` file (or set in Supabase Dashboard → Settings → Environment Variables):

```env
# Supabase
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-staging-anon-key

# Sentry (use separate staging project)
VITE_SENTRY_DSN=your-staging-sentry-dsn
VITE_APP_VERSION=staging

# Demo Mode (optional)
VITE_DEMO_MODE=false
```

**Key Differences from Production:**
- Use separate Supabase project
- Use separate Sentry project (or same project with different environment tag)
- Set `VITE_APP_VERSION=staging` to distinguish in Sentry
- Enable `VITE_DEMO_MODE=true` if you want to seed demo data

### 3. Sync Database Schema

#### Option A: Fresh Migration Sync (Recommended for new staging)

```bash
# 1. Link to staging project
supabase link --project-ref your-staging-project-ref

# 2. Apply all migrations
supabase db push

# 3. Verify migrations
supabase migration list
```

#### Option B: Restore from Production Backup

1. **Download production backup** (see [Backup Procedure](./backup-procedure.md))
2. **Restore to staging:**
   ```bash
   # Get staging connection string from Supabase Dashboard
   # Settings → Database → Connection string
   psql <staging-connection-string> < production-backup.sql
   ```
3. **Run migrations** to ensure schema is up-to-date:
   ```bash
   supabase db push
   ```

### 4. Configure Storage Buckets

In Supabase Dashboard → Storage:

1. **Create buckets** (if not auto-created):
   - `images` - for job photos
   - `invoices` - for invoice PDFs
   - `quotes` - for quote PDFs

2. **Set bucket policies** (copy from production):
   - Public read for `images` (if needed)
   - Authenticated read/write for `invoices`
   - Authenticated read/write for `quotes`

### 5. Set Up Authentication

1. **Configure Auth providers** (if using OAuth):
   - Go to Authentication → Providers
   - Configure same providers as production
   - Use staging callback URLs

2. **Set up email templates** (if customizing):
   - Go to Authentication → Email Templates
   - Copy templates from production

## Testing Procedures

### Test Invoice Lifecycle

1. **Create a test job:**
   - Go to Admin → Jobs
   - Create a new job with a customer
   - Set job cost (e.g., $100)

2. **Mark job as completed:**
   - Update job status to "completed"
   - Or set `completed_at` timestamp

3. **Generate invoice:**
   - Go to Revenue Hub
   - Find job in "Jobs completed but not invoiced" queue
   - Click "Generate Invoice"
   - Verify invoice PDF is created
   - Verify invoice record appears in `invoices` table

4. **Test invoice status transitions:**
   - Verify invoice starts as `draft`
   - Mark as `sent` (should happen automatically when PDF exists)
   - Record a payment
   - Verify invoice status changes to `paid`
   - Test `void_invoice` RPC

5. **Test overdue detection:**
   - Create invoice with `due_date` in the past
   - Call `recompute_invoice_status` RPC
   - Verify status changes to `overdue`

### Test Public Endpoints (Rate Limits)

1. **Test quote viewing:**
   ```bash
   # Get a quote token from staging database
   # Then make multiple requests:
   curl https://your-staging-app.com/quote/<token>
   
   # Should allow 120 requests/hour, 10/minute
   # After limit, should return rate_limit_exceeded error
   ```

2. **Test quote acceptance:**
   - Navigate to public quote page
   - Try accepting multiple times rapidly
   - Should limit to 20/hour, 5/minute

3. **Test schedule requests:**
   - Accept a quote
   - Navigate to schedule request page
   - Try submitting multiple requests
   - Should limit to 20/hour, 5/minute

4. **Verify rate limit events:**
   ```sql
   -- Check rate limit events in staging
   SELECT * FROM rate_limit_events 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

### Test Audit Logging

1. **Perform actions:**
   - Convert quote to job
   - Accept/reject a quote
   - Create invoice
   - Record payment
   - Void invoice

2. **Verify audit logs:**
   ```sql
   SELECT * FROM audit_log 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

3. **Check Sentry:**
   - Verify events appear in Sentry dashboard
   - Check role tags are correct
   - Verify user context is set

## Data Management

### Purge Demo Data

To clean staging for fresh testing:

```sql
-- WARNING: This deletes all data! Use with caution.

-- Delete in order (respecting foreign keys)
DELETE FROM audit_log;
DELETE FROM rate_limit_events;
DELETE FROM payments;
DELETE FROM invoices;
DELETE FROM job_schedule_requests;
DELETE FROM jobs;
DELETE FROM quotes;
DELETE FROM customers;
DELETE FROM profiles WHERE role != 'admin';
-- Keep admin users for testing
```

Or use Supabase Dashboard → Database → Reset (⚠️ deletes everything)

### Seed Demo Data

If `VITE_DEMO_MODE=true` is enabled, you can create a seed script:

```sql
-- Create demo company
INSERT INTO companies (id, name, display_name) 
VALUES ('demo-company-id', 'Demo Lawn Care', 'Demo Lawn Care');

-- Create demo customers
INSERT INTO customers (id, company_id, full_name, email)
VALUES 
  ('demo-customer-1', 'demo-company-id', 'John Smith', 'john@example.com'),
  ('demo-customer-2', 'demo-company-id', 'Jane Doe', 'jane@example.com');

-- Create demo quotes
-- ... (add more seed data as needed)
```

**Note:** Full demo mode seeding will be implemented in a future phase.

## Migration Testing Workflow

Before deploying migrations to production:

1. **Test in staging:**
   ```bash
   # Link to staging
   supabase link --project-ref staging-ref
   
   # Apply migration
   supabase migration up
   
   # Verify migration
   supabase migration list
   ```

2. **Test application:**
   - Verify app still works
   - Test affected features
   - Check for errors in Sentry

3. **Rollback test (if needed):**
   ```bash
   # Test rollback
   supabase migration down
   
   # Verify rollback worked
   # Re-apply migration
   supabase migration up
   ```

4. **Deploy to production:**
   ```bash
   # Link to production
   supabase link --project-ref production-ref
   
   # Apply migration
   supabase migration up
   ```

## Monitoring

### Sentry

- Staging should use separate Sentry project or environment tag
- Monitor for errors during testing
- Verify role tags are correct

### Database Monitoring

- Check Supabase Dashboard → Database → Logs
- Monitor query performance
- Check for slow queries

### Rate Limiting

- Monitor `rate_limit_events` table
- Verify limits are working correctly
- Test edge cases (burst limits, hourly limits)

## Troubleshooting

### Migration Fails

1. Check migration file syntax
2. Verify dependencies (previous migrations)
3. Check for conflicting changes
4. Review Supabase logs

### Authentication Issues

1. Verify environment variables are set correctly
2. Check Supabase Auth settings
3. Verify callback URLs are correct
4. Check browser console for errors

### Storage Issues

1. Verify buckets exist
2. Check bucket policies
3. Verify RLS policies on storage objects
4. Check file upload permissions

## Related Documentation

- [Backup Procedure](./backup-procedure.md)
- [Database Export Script](../../scripts/export-db.ps1)
