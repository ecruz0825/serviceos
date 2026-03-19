import { supabase } from '../supabaseClient';

/**
 * Triggers the email queue processor (fire-and-forget).
 * 
 * This function invokes the send-quote-emails edge function to process
 * any queued emails. It's designed to be called after enqueue_email()
 * to ensure immediate processing without blocking the caller.
 * 
 * The edge function has built-in duplicate prevention:
 * - Messages are marked as 'processing' before being handled
 * - Only 'queued' messages are fetched for processing
 * - This prevents race conditions when multiple triggers occur
 * 
 * @param {Object} options - Optional configuration
 * @param {string} options.messageType - Filter to process only specific message type
 * @returns {void} - Fire-and-forget, no return value
 */
export function triggerEmailProcessing(options = {}) {
  const body = {};
  if (options.messageType) {
    body.message_type = options.messageType;
  }

  supabase.functions.invoke('send-quote-emails', {
    method: 'POST',
    body: Object.keys(body).length > 0 ? body : undefined,
  }).then(({ data, error }) => {
    if (error) {
      console.warn('[EmailQueue] Processing trigger failed (non-fatal):', error.message);
    } else if (data) {
      const { processed = 0, sent = 0, failed = 0 } = data;
      if (processed > 0) {
        console.log(`[EmailQueue] Processed ${processed} message(s): ${sent} sent, ${failed} failed`);
      }
    }
  }).catch(err => {
    console.warn('[EmailQueue] Processing trigger error (non-fatal):', err);
  });
}
