import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useUser } from '../../context/UserContext';
import useCompanySettings from '../../hooks/useCompanySettings';
import Button from '../ui/Button';
import toast from 'react-hot-toast';
import { triggerEmailProcessing } from '../../utils/emailQueue';

/**
 * SendCollectionEmailModal - Modal for sending collection emails via queue + logging
 * 
 * Props:
 * - open: boolean - Controls modal visibility
 * - customerId: uuid - Customer ID to send email to
 * - defaultTemplateKey: string (optional) - Default template to pre-select
 * - onSent: function - Called after email is queued and communication is logged
 * - onClose: function - Called when modal is closed
 */
export default function SendCollectionEmailModal({
  open,
  customerId,
  defaultTemplateKey = null,
  onSent,
  onClose,
}) {
  const { effectiveCompanyId } = useUser();
  const { settings } = useCompanySettings();
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [customerContact, setCustomerContact] = useState(null);
  const [customerContactLoading, setCustomerContactLoading] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(defaultTemplateKey || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch templates and customer contact on open
  useEffect(() => {
    if (!open || !customerId) return;

    const fetchData = async () => {
      // Fetch templates
      setTemplatesLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_collections_comm_templates_for_company');
        if (error) {
          console.error('Error fetching templates:', error);
          setTemplates([]);
        } else {
          setTemplates(data || []);
        }
      } catch (err) {
        console.error('Error fetching templates:', err);
        setTemplates([]);
      } finally {
        setTemplatesLoading(false);
      }

      // Fetch customer contact
      setCustomerContactLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_customer_contact_for_company', {
          p_customer_id: customerId
        });
        if (error) {
          console.error('Error fetching customer contact:', error);
          setCustomerContact(null);
        } else {
          setCustomerContact(data && data.length > 0 ? data[0] : null);
        }
      } catch (err) {
        console.error('Error fetching customer contact:', err);
        setCustomerContact(null);
      } finally {
        setCustomerContactLoading(false);
      }
    };

    fetchData();
  }, [open, customerId]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setSelectedTemplateKey(defaultTemplateKey || '');
      setSubject('');
      setBody('');
    }
  }, [open, defaultTemplateKey]);

  // Update subject/body when template changes
  useEffect(() => {
    if (!selectedTemplateKey || templates.length === 0) {
      setSubject('');
      setBody('');
      return;
    }

    const template = templates.find(t => t.template_key === selectedTemplateKey);
    if (template) {
      // Simple placeholder replacement (can be enhanced later)
      const customerName = customerContact?.customer_name || '{{customer_name}}';
      const customerEmail = customerContact?.customer_email || '{{customer_email}}';
      
      // For now, just set the templates as-is (placeholders will be in the template)
      // In a real implementation, you'd replace placeholders with actual values
      setSubject(template.subject_template || '');
      setBody(template.body_template || '');
    }
  }, [selectedTemplateKey, templates, customerContact]);

  // Handle ESC key
  useEffect(() => {
    if (!open || sending) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, sending, onClose]);

  // Short-circuit rendering AFTER all hooks
  if (!open) return null;

  const handleSendEmail = async () => {
    // Validate subject and body
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter a message body');
      return;
    }

    // Validate customer email
    const customerEmail = customerContact?.customer_email;
    if (!customerEmail) {
      toast.error('Customer has no email address');
      return;
    }

    setSending(true);
    try {
      const brandName = settings?.display_name || 'Your Service Provider';
      const customerName = customerContact?.customer_name || 'Customer';
      
      // Build HTML content from plain text body
      const htmlContent = `
<div style="font-family: sans-serif; line-height: 1.6; max-width: 600px;">
  ${body.trim().split('\n').map(line => 
    line.trim() ? `<p style="margin: 0 0 1em 0;">${line}</p>` : ''
  ).join('')}
</div>
      `.trim();

      // Queue the email via enqueue_email RPC
      const { error: enqueueError } = await supabase.rpc('enqueue_email', {
        p_company_id: effectiveCompanyId,
        p_message_type: 'collection',
        p_to_email: customerEmail,
        p_subject: subject.trim(),
        p_payload: {
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          template_key: selectedTemplateKey || null,
          brand_name: brandName,
        },
        p_html_content: htmlContent,
        p_text_content: body.trim(),
        p_customer_id: customerId,
      });

      if (enqueueError) {
        console.error('Error queueing collection email:', enqueueError);
        toast.error(enqueueError.message || 'Failed to queue email');
        return;
      }

      triggerEmailProcessing();

      // Log the communication (preserves existing tracking)
      try {
        await supabase.rpc('log_collection_communication', {
          p_customer_id: customerId,
          p_channel: 'email',
          p_invoice_id: null,
          p_template_key: selectedTemplateKey || null,
          p_to_address: customerEmail,
          p_subject: subject.trim(),
          p_body: body.trim()
        });
      } catch (logError) {
        console.warn('Failed to log communication (non-fatal):', logError);
        // Don't fail the whole operation if logging fails
      }

      toast.success('Collection email queued');

      // Call onSent callback to refetch queues/feeds
      if (onSent) {
        onSent();
      }

      // Close modal
      onClose();
    } catch (err) {
      console.error('Error sending collection email:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setSending(false);
    }
  };

  const canSendEmail = !!customerContact?.customer_email && subject.trim() && body.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        // Close on backdrop click (unless sending)
        if (e.target === e.currentTarget && !sending) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" />

      {/* Modal Card */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 z-10 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Send Collection Email
          </h3>
          {customerContact && (
            <p className="text-sm text-slate-600 mb-4">
              To: <span className="font-medium">{customerContact.customer_name || 'Unknown'}</span>
              {customerContact.customer_email && (
                <span className="ml-2 text-slate-500">({customerContact.customer_email})</span>
              )}
            </p>
          )}

          {/* Template Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Template
              <span className="text-slate-500 text-xs ml-1">(optional)</span>
            </label>
            {templatesLoading ? (
              <div className="text-sm text-slate-500">Loading templates...</div>
            ) : (
              <select
                value={selectedTemplateKey}
                onChange={(e) => setSelectedTemplateKey(e.target.value)}
                disabled={sending}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                <option value="">None (Custom)</option>
                {templates.map(template => (
                  <option key={template.template_key} value={template.template_key}>
                    {template.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subject Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              placeholder="Email subject..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Body Field */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={sending}
              rows={8}
              placeholder="Email message..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Email Hint */}
          {!customerContact?.customer_email && !customerContactLoading && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                Customer email not available. Please add an email address to the customer record.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSendEmail}
              disabled={!canSendEmail || sending}
            >
              {sending ? 'Sending...' : 'Send Email'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
