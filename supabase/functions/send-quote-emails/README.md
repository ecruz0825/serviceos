# Send Quote Emails Edge Function

This edge function processes queued quote email messages and sends them to customers via Resend.

## Required Environment Variables

Set these secrets in your Supabase project:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
supabase secrets set RESEND_FROM="Your Company <quotes@yourdomain.com>"
```

- **RESEND_API_KEY**: Your Resend API key (get from https://resend.com/api-keys)
- **RESEND_FROM**: Email sender address in format `"Name <email@domain.com>"` (must be a verified domain in Resend)

## How It Works

1. Fetches up to 10 queued messages from `quote_messages` table (status='queued')
2. For each message:
   - Fetches quote, customer, and company data
   - Generates a PDF using jsPDF
   - Uploads PDF to `quote-pdfs` storage bucket
   - Creates a signed URL (1 hour expiry)
   - Sends email via Resend API with PDF download link
   - Updates message status to 'sent' or 'failed'

## Storage Bucket

**Important**: Create a private bucket named `quote-pdfs` in Supabase Dashboard before using this function.

- Bucket name: `quote-pdfs`
- Visibility: Private
- Path format: `{company_id}/{quote_id}.pdf`

Storage policies are created via migration `20260130000000_quote_pdfs_bucket_policies.sql`.

## Usage

Call via Supabase Functions:

```javascript
const { data, error } = await supabase.functions.invoke('send-quote-emails', {
  method: 'POST'
})
```

Response:
```json
{
  "sentCount": 5,
  "failedCount": 0,
  "total": 5
}
```

## Email Format

The email includes:
- Custom body text (from `quote_messages.body`)
- Quote number and total amount
- Download button/link to the signed PDF URL

## Error Handling

- Failed messages are marked with `status='failed'` and `error` field populated
- Successful messages are marked with `status='sent'`
- Errors are logged to console for debugging

