import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useUser } from "../../context/UserContext";
import toast from "react-hot-toast";
import ServicesCard from "./ServicesCard";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import { isDemoMode } from "../../lib/demo-mode";
import useConfirm from "../../hooks/useConfirm";
import { useBrand } from "../../context/BrandContext";
import { useBillingGuard } from "../../components/ui/BillingGuard";
import BillingGuard from "../../components/ui/BillingGuard";


export default function Settings() {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { refreshBrand } = useBrand();
  const { effectiveCompanyId, supportMode, role } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    support_email: "",
    support_phone: "",
    address: "",
    email_footer: "",
    timezone: "America/Chicago",
    secondary_color: "",
    accent_color: "",
  });
  const [crewLabel, setCrewLabel] = useState('');
  const [customerLabel, setCustomerLabel] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#22c55e');
  const [autoGenerateRecurring, setAutoGenerateRecurring] = useState(false);
  const [logoPath, setLogoPath] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);


  useEffect(() => {
    (async () => {
      setLoading(true);
      // Use effectiveCompanyId from UserContext (supports support mode)
      if (!effectiveCompanyId) {
        setLoading(false);
        return;
      }
      setCompanyId(effectiveCompanyId);

      // 2) Load existing company settings
      const { data: company, error: cErr } = await supabase
  .from("companies")
  .select("display_name, support_email, support_phone, address, logo_path, email_footer, timezone, name, crew_label, customer_label, primary_color, secondary_color, accent_color, auto_generate_recurring_jobs")
  .eq("id", effectiveCompanyId)
  .single();

      if (cErr) {
  toast.error(cErr.message);
} else if (company) {
  setForm({
    display_name: company.display_name || company.name || "",
    support_email: company.support_email || "",
    support_phone: company.support_phone || "",
    address: company.address || "",
    email_footer: company.email_footer || "",
    timezone: company.timezone || "America/Chicago",
    secondary_color: company.secondary_color || "",
    accent_color: company.accent_color || "",
  });

  setCrewLabel(company.crew_label || "Crew");
  setCustomerLabel(company.customer_label || "Customer");
  setPrimaryColor(company.primary_color || "#22c55e");
  setAutoGenerateRecurring(
    typeof company.auto_generate_recurring_jobs === "boolean"
      ? company.auto_generate_recurring_jobs
      : false
  );
  setLogoPath(company.logo_path || null);
  
  // Load logo preview if logo_path exists
  if (company.logo_path && effectiveCompanyId) {
    try {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("branding")
        .createSignedUrl(company.logo_path, 3600);
      if (!signedUrlError && signedUrlData?.signedUrl) {
        setLogoPreviewUrl(signedUrlData.signedUrl);
      } else {
        setLogoPreviewUrl(null);
      }
    } catch (e) {
      console.warn("Failed to load logo preview:", e);
      setLogoPreviewUrl(null);
    }
  } else {
    setLogoPreviewUrl(null);
  }
}
setLoading(false);
    })();
  }, [effectiveCompanyId]);

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogoUpload = async (e) => {
    if (supportMode) {
      toast.error("Logo uploads are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Logo uploads are disabled due to billing status.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or WEBP image');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    try {
      // Determine file extension
      const ext = file.name.split('.').pop().toLowerCase();
      const validExt = ['png', 'jpg', 'jpeg', 'webp'];
      const fileExt = validExt.includes(ext) ? ext : 'png';
      
      // Upload path: branding/{company_id}/logo.{ext}
      const storagePath = `${companyId}/logo.${fileExt}`;
      const bucketName = "branding";

      // Upload to storage (upsert: true to replace existing)
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Update companies table with logo_path
      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_path: storagePath })
        .eq("id", companyId);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setLogoPath(storagePath);
      
      // Get signed URL for preview
      const { data: signedUrlData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, 3600);
      
      if (signedUrlData?.signedUrl) {
        setLogoPreviewUrl(signedUrlData.signedUrl);
      }

      toast.success("Logo uploaded successfully");
    } catch (error) {
      console.error("Logo upload failed:", error);
      toast.error(error.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLogoRemove = async () => {
    if (supportMode) {
      toast.error("Settings cannot be modified in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Settings cannot be modified due to billing status.");
      return;
    }
    if (!companyId || !logoPath) return;

    try {
      // Remove from storage
      const { error: deleteError } = await supabase.storage
        .from("branding")
        .remove([logoPath]);

      // Clear logo_path in companies table (even if storage delete fails)
      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_path: null })
        .eq("id", companyId);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setLogoPath(null);
      setLogoPreviewUrl(null);

      toast.success("Logo removed successfully");
    } catch (error) {
      console.error("Logo removal failed:", error);
      toast.error(error.message || "Failed to remove logo");
    }
  };

  const save = async () => {
  if (supportMode) {
    toast.error("Settings cannot be saved in support mode.");
    return;
  }
  if (!companyId) return;
  const { error } = await supabase
  .from("companies")
  .update({
    display_name: form.display_name || null,
    support_email: form.support_email || null,
    support_phone: form.support_phone || null,
    address: form.address || null,
    email_footer: form.email_footer || "",
    timezone: form.timezone || "America/Chicago",
    crew_label: crewLabel || "Crew",
    customer_label: customerLabel || "Customer",
    primary_color: primaryColor || "#22c55e",
    secondary_color: form.secondary_color || null,
    accent_color: form.accent_color || null,
    auto_generate_recurring_jobs: autoGenerateRecurring,
  })
  .eq("id", companyId);

  if (error) {
    toast.error(error.message);
  } else {
    toast.success("Settings saved");
    // Refresh brand to apply changes immediately
    refreshBrand();
  }
};

  const handleLoadDemoData = async () => {
    if (supportMode) {
      toast.error("Demo data operations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Demo data operations are disabled due to billing status.");
      return;
    }
    if (!companyId) return;

    setDemoLoading(true);
    try {
      const { data, error } = await supabase.rpc('seed_demo_data', {
        p_company_id: companyId,
      });

      if (error) throw error;

      if (data?.status === 'ok') {
        const counts = data;
        toast.success(
          `Demo data loaded: ${counts.customers_created || 0} customers, ${counts.quotes_created || 0} quotes, ${counts.jobs_created || 0} jobs, ${counts.invoices_created || 0} invoices`
        );
      } else {
        toast.error(data?.message || 'Failed to load demo data');
      }
    } catch (err) {
      console.error('Error loading demo data:', err);
      toast.error(err.message || 'Failed to load demo data');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleClearDemoData = async () => {
    if (supportMode) {
      toast.error("Demo data operations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Demo data operations are disabled due to billing status.");
      return;
    }
    if (!companyId) return;

    const confirmed = await confirm({
      title: 'Clear Demo Data?',
      message: 'This will permanently delete all demo customers, quotes, jobs, invoices, and payments. This action cannot be undone.',
      confirmText: 'Clear All',
      confirmVariant: 'danger',
    });

    if (!confirmed) return;

    setDemoLoading(true);
    try {
      const { data, error } = await supabase.rpc('purge_demo_data', {
        p_company_id: companyId,
      });

      if (error) throw error;

      if (data?.status === 'ok') {
        const counts = data.deleted_counts || {};
        toast.success(
          `Demo data cleared: ${counts.customers || 0} customers, ${counts.quotes || 0} quotes, ${counts.jobs || 0} jobs, ${counts.invoices || 0} invoices deleted`
        );
      } else {
        toast.error(data?.message || 'Failed to clear demo data');
      }
    } catch (err) {
      console.error('Error clearing demo data:', err);
      toast.error(err.message || 'Failed to clear demo data');
    } finally {
      setDemoLoading(false);
    }
  };

  // Defense-in-depth: Page-level role guard (admin only)
  if (role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (loading) return <div className="p-8">Loading settings…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Manage branding, labels, and automation preferences."
        actions={
          <Button variant="primary" type="submit" form="settings-form" disabled={supportMode}>
            Save Settings
          </Button>
        }
      />

      {/* Services manager */}
      <ServicesCard />

      <Card>
        <h3 className="text-lg font-semibold mb-2">Billing & Subscription</h3>
        <p className="text-sm text-slate-600 mb-3">
          View current plan and subscription status.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate("/admin/billing")}
        >
          Open Billing
        </Button>
      </Card>

      <form id="settings-form" onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-6">
        {/* Branding Card */}
        <Card>
          <h3 className="text-lg font-semibold mb-4">Branding</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Display Name</label>
              <input
                name="display_name"
                value={form.display_name}
                onChange={onChange}
                className="border p-2 rounded w-full"
                placeholder="e.g., ServiceOps"
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Company Logo</label>
              
              {/* Logo Preview */}
              {logoPreviewUrl ? (
                <div className="mb-3">
                  <img
                    src={logoPreviewUrl}
                    alt="Logo preview"
                    className="h-16 w-auto object-contain border rounded p-2 bg-gray-50"
                  />
                </div>
              ) : null}

              {/* Upload Controls */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo || billingDisabled}
                  className="hidden"
                />
                <BillingGuard>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={supportMode || uploadingLogo || billingDisabled}
                    onClick={() => fileInputRef.current?.click()}
                    title={supportMode ? "Logo uploads are disabled in support mode" : billingDisabled ? billingReason : undefined}
                  >
                    {uploadingLogo ? "Uploading..." : logoPath ? "Replace Logo" : "Upload Logo"}
                  </Button>
                </BillingGuard>
                
                {logoPath && (
                  <BillingGuard>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleLogoRemove}
                      disabled={supportMode || uploadingLogo || billingDisabled}
                      className="text-red-600 hover:text-red-700"
                      title={supportMode ? "Logo removal is disabled in support mode" : billingDisabled ? billingReason : undefined}
                    >
                      Remove
                    </Button>
                  </BillingGuard>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Upload PNG, JPG, or WEBP (max 5MB). Used in quote PDFs and portal.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Brand Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer border rounded-md"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={billingDisabled}
                />
                <span className="text-sm text-gray-500">
                  Used for buttons and highlights in your portal.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secondary Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  name="secondary_color"
                  className="h-10 w-16 cursor-pointer border rounded-md"
                  value={form.secondary_color}
                  onChange={onChange}
                  disabled={billingDisabled}
                />
                <span className="text-sm text-gray-500">
                  Optional secondary color for accents and variations.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accent Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  name="accent_color"
                  className="h-10 w-16 cursor-pointer border rounded-md"
                  value={form.accent_color}
                  onChange={onChange}
                  disabled={billingDisabled}
                />
                <span className="text-sm text-gray-500">
                  Optional accent color for special highlights.
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact Card */}
        <Card>
          <h3 className="text-lg font-semibold mb-4">Contact</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Support Email</label>
                <input
                  name="support_email"
                  value={form.support_email}
                  onChange={onChange}
                  className="border p-2 rounded w-full"
                  placeholder="support@yourcompany.com"
                  type="email"
                  disabled={billingDisabled}
                  readOnly={billingDisabled}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Support Phone</label>
                <input
                  name="support_phone"
                  value={form.support_phone}
                  onChange={onChange}
                  className="border p-2 rounded w-full"
                  placeholder="(555) 123-4567"
                  disabled={billingDisabled}
                  readOnly={billingDisabled}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Business Address</label>
              <textarea
                name="address"
                value={form.address}
                onChange={onChange}
                className="border p-2 rounded w-full"
                rows={2}
                placeholder="123 Main St, City, ST 12345"
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Email Footer</label>
              <textarea
                name="email_footer"
                value={form.email_footer}
                onChange={onChange}
                className="border p-2 rounded w-full"
                rows={3}
                placeholder={`Thanks for choosing ${form.display_name || "our company"}!`}
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
            </div>
          </div>
        </Card>

        {/* Labels Card */}
        <Card>
          <h3 className="text-lg font-semibold mb-4">Labels</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Crew Label (singular)
              </label>
              <input
                type="text"
                className="border p-2 rounded w-full"
                value={crewLabel}
                onChange={(e) => setCrewLabel(e.target.value)}
                placeholder="Crew / Technicians / Staff"
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Label (singular)
              </label>
              <input
                type="text"
                className="border p-2 rounded w-full"
                value={customerLabel}
                onChange={(e) => setCustomerLabel(e.target.value)}
                placeholder="Customer / Client"
                disabled={billingDisabled}
                readOnly={billingDisabled}
              />
            </div>
          </div>
        </Card>

        {/* Automation Card */}
        <Card>
          <h3 className="text-lg font-semibold mb-4">Automation</h3>
          <div className="space-y-4">
            <div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoGenerateRecurring}
                  onChange={(e) => setAutoGenerateRecurring(e.target.checked)}
                  disabled={billingDisabled}
                />
                <span className="text-sm text-gray-700">
                  Automatically generate upcoming jobs from recurring schedules each day
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium">Timezone</label>
              <select
                name="timezone"
                value={form.timezone}
                onChange={onChange}
                className="border p-2 rounded w-full"
                disabled={billingDisabled}
              >
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                <option value="America/Denver">America/Denver (MT)</option>
                <option value="America/Chicago">America/Chicago (CT)</option>
                <option value="America/New_York">America/New_York (ET)</option>
              </select>
            </div>
          </div>
        </Card>
      </form>

      {/* Demo Data Section */}
      {isDemoMode() && (
        <Card>
          <h3 className="text-lg font-semibold mb-4">Demo Data</h3>
          <p className="text-sm text-slate-600 mb-4">
            Load sample customers, quotes, jobs, and invoices to explore the app. You can clear them anytime.
          </p>
          <div className="flex gap-3">
            <BillingGuard>
              <Button
                variant="secondary"
                onClick={handleLoadDemoData}
                disabled={demoLoading || !companyId || billingDisabled}
                title={billingDisabled ? billingReason : undefined}
              >
                {demoLoading ? 'Loading...' : 'Load Demo Data'}
              </Button>
            </BillingGuard>
            <BillingGuard>
              <Button
                variant="danger"
                onClick={handleClearDemoData}
                disabled={supportMode || demoLoading || !companyId || billingDisabled}
                title={billingDisabled ? billingReason : undefined}
              >
                {demoLoading ? 'Clearing...' : 'Clear Demo Data'}
              </Button>
            </BillingGuard>
          </div>
        </Card>
      )}
      <ConfirmDialog />
    </div>
  );
}