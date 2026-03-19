import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import toast from "react-hot-toast";
import Button from "../../components/ui/Button";
import useConfirm from "../../hooks/useConfirm";

export default function ServicesCard() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [companyId, setCompanyId] = useState(null);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: "", default_price: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (profile?.company_id) setCompanyId(profile.company_id);
    })();
  }, []);

  useEffect(() => { if (companyId) fetchServices(); }, [companyId]);

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, default_price, description")
      .eq("company_id", companyId)
      .order("name");
    if (error) toast.error(error.message);
    else setServices(data || []);
  };

  const onChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const addService = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Service name is required");
    setLoading(true);
    const payload = {
      name: form.name.trim(),
      default_price: form.default_price ? Number(form.default_price) : null,
      company_id: companyId,
    };
    const { error } = await supabase.from("services").insert([payload]);
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Service added");
      setForm({ name: "", default_price: "" });
      fetchServices();
    }
  };

  const removeService = async (id) => {
    const confirmed = await confirm({
      title: 'Delete service?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;
    
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Service deleted.");
      setServices(prev => prev.filter(s => s.id !== id));
    }
  };

  return (
    <div className="bg-white rounded shadow p-4">
      <h2 className="text-lg font-semibold mb-3">Services</h2>

      <form onSubmit={addService} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          name="name"
          placeholder="Service name (e.g., Driveway Cleaning)"
          value={form.name}
          onChange={onChange}
          className="border p-2 rounded flex-1"
        />
        <input
          name="default_price"
          placeholder="Default price (optional)"
          value={form.default_price}
          onChange={onChange}
          className="border p-2 rounded w-full sm:w-40"
        />
        <Button disabled={loading} variant="primary" className="px-4 py-2">
          Add
        </Button>
      </form>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Service</th>
              <th className="p-2 text-left">Default Price</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.id} className="border-t">
                <td className="p-2">{s.name}</td>
                <td className="p-2">
                  {s.default_price != null ? `$${Number(s.default_price).toFixed(2)}` : "—"}
                </td>
                <td className="p-2">
                  <Button onClick={() => removeService(s.id)} variant="danger">
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr><td className="p-4 text-gray-500" colSpan="3">No services yet. Add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog />
    </div>
  );
}
