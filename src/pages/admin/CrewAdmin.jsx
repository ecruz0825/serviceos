import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import useConfirm from '../../hooks/useConfirm';
import handlePlanLimitError from '../../utils/handlePlanLimitError';
import usePlanLimits from '../../hooks/usePlanLimits';
import UpgradeLimitModal from '../../components/ui/UpgradeLimitModal';
import { useUser } from '../../context/UserContext';
import { X } from 'lucide-react';
import { useBillingGuard } from '../../components/ui/BillingGuard';
import BillingGuard from '../../components/ui/BillingGuard';
import LimitCard from '../../components/ui/LimitCard';
import LimitWarningBanner from '../../components/ui/LimitWarningBanner';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import Card from '../../components/ui/Card';
import useCompanySettings from '../../hooks/useCompanySettings';
import { Users } from 'lucide-react';

export default function CrewAdmin() {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { plan, limits, usage, isLoading: limitsLoading, canAddCrew } = usePlanLimits();
  const { supportMode } = useUser();
  const { disabled: billingDisabled, reason: billingReason } = useBillingGuard();
  const { settings } = useCompanySettings();
  const crewLabel = settings?.crew_label || "Crew";
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [crew, setCrew] = useState([]);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'crew' });
  const [staffInviteForm, setStaffInviteForm] = useState({ full_name: '', email: '', role: 'crew' });
  const [editingId, setEditingId] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [invitingStaff, setInvitingStaff] = useState(false);
  
  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedCrewMember, setSelectedCrewMember] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [passwordModalMode, setPasswordModalMode] = useState('set'); // 'set' or 'create'

  // get current user's company_id
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();
      setCompanyId(profile?.company_id || null);
    };
    init();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetchCrew();
  }, [companyId]);

  const fetchCrew = async () => {
    const { data, error } = await supabase
      .from('crew_members')
      .select('id, full_name, email, phone, role, user_id')
      .eq('company_id', companyId)
      .order('full_name');
    if (error) toast.error(error.message);
    else setCrew(data || []);
  };

  const onChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const onStaffInviteChange = (e) =>
    setStaffInviteForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const saveCrew = async (e) => {
    e.preventDefault();
    if (!form.full_name) return toast.error('Name required');
    
    if (supportMode) {
      toast.error("Crew mutations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Crew mutations are disabled due to billing status.");
      return;
    }
    
    // Proactive limit check (only for new crew, not edits)
    if (!editingId && !limitsLoading) {
      if (!canAddCrew) {
        setShowUpgradeModal(true);
        return;
      }
    }
    
    setLoading(true);
    if (editingId) {
      const { error } = await supabase
        .from('crew_members')
        .update({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          role: form.role || 'crew'
        })
        .eq('id', editingId);
      if (error) toast.error(error.message);
      else toast.success('Worker updated');
    } else {
      const { error } = await supabase
        .from('crew_members')
        .insert([{
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          role: form.role || 'crew',
          company_id: companyId
        }]);
      if (error) {
        if (!handlePlanLimitError(error, navigate)) {
          toast.error(error.message);
        }
      } else {
        toast.success('Worker added');
      }
    }
    setLoading(false);
    setForm({ full_name: '', email: '', phone: '', role: 'crew' });
    setEditingId(null);
    fetchCrew();
  };

  const editCrew = (row) => {
    setEditingId(row.id);
    setForm({
      full_name: row.full_name || '',
      email: row.email || '',
      phone: row.phone || '',
      role: row.role || 'crew'
    });
  };

  const deleteCrew = async (id) => {
    if (supportMode) {
      toast.error("Crew deletions are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Crew deletions are disabled due to billing status.");
      return;
    }
    
    const confirmed = await confirm({
      title: 'Delete worker?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;
    
    const { error } = await supabase.from('crew_members').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Worker deleted.');
      fetchCrew();
    }
  };

  // Invite worker to crew portal via hardened edge function
  const inviteCrew = async (row) => {
    if (supportMode) {
      toast.error("Crew invites are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Crew invites are disabled due to billing status.");
      return;
    }
    
    if (!row.email) return toast.error('Worker email is required to invite.');
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: row.email,
        full_name: row.full_name || null,
        role: 'crew',
        crew_member_id: row.id,
        app_next: '/crew',
      },
    });

    if (error) {
      toast.error(error.message || 'Failed to send invite');
      return;
    }

    if (data?.status === 'already_registered') {
      toast.success('This worker already has an account.', { icon: 'ℹ️' });
      return;
    }

    toast.success('Invite email sent!');
  };

  // Generate secure password
  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let result = "";
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Handle set password
  function handleSetPassword(crewMember) {
    setSelectedCrewMember(crewMember);
    setTempPassword('');
    setModalError('');
    setModalSuccess('');
    setPasswordModalMode('set');
    setShowPasswordModal(true);
  }

  // Handle create login
  function handleCreateLogin(crewMember) {
    if (supportMode) {
      toast.error("User account creation is disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "User account creation is disabled due to billing status.");
      return;
    }
    setSelectedCrewMember(crewMember);
    setTempPassword(generatePassword()); // Auto-generate password
    setModalError('');
    setModalSuccess('');
    setPasswordModalMode('create');
    setShowPasswordModal(true);
  }

  // Handle save password
  const handleSavePassword = async () => {
    if (supportMode) {
      toast.error("Password operations are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Password operations are disabled due to billing status.");
      return;
    }
    if (passwordModalMode === 'create') {
      // Create login flow
      if (!selectedCrewMember?.email) {
        toast.error('Crew member email is required to create login');
        setModalError('Crew member email is required to create login');
        return;
      }

      if (selectedCrewMember?.user_id) {
        toast.error('Crew member already has a login account');
        setModalError('Crew member already has a login account. Use "Set Password" to update it.');
        return;
      }

      if (!tempPassword || tempPassword.trim().length < 8) {
        setModalError('Password must be at least 8 characters long.');
        return;
      }

      setIsSavingPassword(true);
      setModalError('');
      setModalSuccess('');

      try {
        const passwordToSet = tempPassword.trim();
        
        console.log('[CrewAdmin] create-crew-login', {
          crewMemberId: selectedCrewMember.id,
          crewEmail: selectedCrewMember.email,
          passwordLength: passwordToSet.length,
        });

        const { data, error } = await supabase.functions.invoke('create-crew-login', {
          body: {
            crew_member_id: selectedCrewMember.id,
            email: selectedCrewMember.email,
            full_name: selectedCrewMember.full_name || null,
            company_id: companyId,
            temp_password: passwordToSet,
          },
        });

        if (error) {
          console.error('[CrewAdmin] Edge function error:', error);
          setModalError(error.message || 'Failed to create login. Please try again.');
          return;
        }

        // Handle non-ok responses
        if (!data?.ok) {
          console.error('[CrewAdmin] Edge function returned error:', data);
          setModalError(data?.error || `Failed to create login: ${data?.message || 'Unknown error'}`);
          return;
        }

        // Handle success
        if (data.ok === true) {
          console.log('[CrewAdmin] create-crew-login success', {
            userId: data.user_id,
            reused: data.reused,
          });
          
          setModalSuccess(
            `Login created successfully! Crew member can now sign in at /login with email: ${selectedCrewMember.email}`
          );
          
          // Refresh crew data to update user_id
          await fetchCrew();
          
          // Close modal after 1.5 seconds
          setTimeout(() => {
            setShowPasswordModal(false);
            setModalSuccess('');
            setTempPassword('');
            setSelectedCrewMember(null);
            setPasswordModalMode('set');
          }, 1500);
        } else {
          console.error('[CrewAdmin] Unexpected success response format:', data);
          setModalError('Login may have been created, but received unexpected response format.');
        }
      } catch (err) {
        console.error('Error creating login:', err);
        setModalError('Failed to create login. Please try again.');
      } finally {
        setIsSavingPassword(false);
      }
    } else {
      // Set password flow (existing logic)
      if (!selectedCrewMember?.user_id) {
        setModalError('Crew member does not have a user account. Please create login first.');
        return;
      }

      if (!tempPassword || tempPassword.trim().length < 8) {
        setModalError('Password must be at least 8 characters long.');
        return;
      }

      setIsSavingPassword(true);
      setModalError('');
      setModalSuccess('');

      try {
        const user_id = selectedCrewMember.user_id;
        const passwordToSet = tempPassword.trim();
        
        console.log('[CrewAdmin] set-crew-password', {
          crewMemberId: selectedCrewMember.id,
          crewEmail: selectedCrewMember.email,
          authUserId: selectedCrewMember.user_id,
          passwordLength: passwordToSet.length,
        });

        const { data, error } = await supabase.functions.invoke('set-crew-password', {
          body: {
            user_id: user_id,
            crew_member_id: selectedCrewMember.id,
            crew_email: selectedCrewMember.email,
            new_password: passwordToSet,
          },
        });

        if (error) {
          console.error('[CrewAdmin] Edge function error:', error);
          setModalError(error.message || 'Failed to set password. Please try again.');
          return;
        }

        // Handle non-ok responses
        if (!data?.ok) {
          if (data?.code === 'EMAIL_MISMATCH') {
            console.error('[CrewAdmin] Email mismatch detected', {
              auth_email: data.auth_email,
              crew_email: data.crew_email,
            });
            setModalError(
              `This crew member is linked to ${data.auth_email}, not ${data.crew_email}. Password was NOT changed.`
            );
            // Do NOT close the modal on EMAIL_MISMATCH
            return;
          } else {
            console.error('[CrewAdmin] Edge function returned error:', data);
            setModalError(`Failed to set password: ${data?.message || 'Unknown error'}`);
            return;
          }
        }

        // Handle success
        if (data.ok === true && data.code === 'PASSWORD_UPDATED') {
          console.log('[CrewAdmin] set-crew-password success', {
            userId: data.user_id,
            userEmail: data.user_email,
          });
          
          setModalSuccess(
            data.user_email
              ? `Password set successfully for ${data.user_email}. Crew member can now log in at /login`
              : 'Password set successfully. Crew member can now log in at /login'
          );
        } else {
          console.error('[CrewAdmin] Unexpected success response format:', data);
          setModalError('Password may have been set, but received unexpected response format.');
        }
        
        // Close modal after 1.5 seconds
        setTimeout(() => {
          setShowPasswordModal(false);
          setModalSuccess('');
          setTempPassword('');
          setSelectedCrewMember(null);
          setPasswordModalMode('set');
        }, 1500);
      } catch (err) {
        console.error('Error setting password:', err);
        setModalError('Failed to set password. Please try again.');
      } finally {
        setIsSavingPassword(false);
      }
    }
  };

  const inviteInternalStaff = async (e) => {
    e.preventDefault();
    
    if (supportMode) {
      toast.error("Staff invites are disabled in support mode.");
      return;
    }
    
    if (billingDisabled) {
      toast.error(billingReason || "Staff invites are disabled due to billing status.");
      return;
    }
    
    const email = staffInviteForm.email.trim();
    const role = staffInviteForm.role;
    if (!email) {
      toast.error('Email is required');
      return;
    }
    if (!['admin', 'manager', 'dispatcher', 'crew'].includes(role)) {
      toast.error('Please select a valid internal role');
      return;
    }

    setInvitingStaff(true);
    try {
      const appNextByRole = {
        admin: '/admin',
        manager: '/admin/revenue-hub',
        dispatcher: '/admin/revenue-hub',
        crew: '/crew',
      };

      let crewMemberId = null;

      // For crew role, create/find crew_member first (canonical flow)
      if (role === 'crew') {
        // Check if crew member already exists for this email
        const { data: existingCrew, error: checkError } = await supabase
          .from('crew_members')
          .select('id, full_name, email')
          .eq('company_id', companyId)
          .eq('email', email)
          .maybeSingle();

        if (checkError) {
          console.error('[CrewAdmin] Error checking existing crew:', checkError);
          toast.error('Failed to check existing crew member');
          return;
        }

        if (existingCrew) {
          // Use existing crew member
          crewMemberId = existingCrew.id;
          console.log('[CrewAdmin] Using existing crew member:', crewMemberId);
        } else {
          // Create new crew member
          const { data: newCrew, error: crewError } = await supabase
            .from('crew_members')
            .insert({
              company_id: companyId,
              full_name: staffInviteForm.full_name.trim() || null,
              email: email,
              phone: null,
              role: 'crew',
            })
            .select('id')
            .single();

          if (crewError) {
            console.error('[CrewAdmin] Error creating crew member:', crewError);
            if (!handlePlanLimitError(crewError, navigate)) {
              toast.error(crewError.message || 'Failed to create crew member');
            }
            return;
          }

          if (!newCrew?.id) {
            console.error('[CrewAdmin] Crew member created but no ID returned');
            toast.error('Failed to create crew member: no ID returned');
            return;
          }

          crewMemberId = newCrew.id;
          console.log('[CrewAdmin] Created crew member:', crewMemberId);
        }
      }

      // Now invite with crew_member_id if crew role
      const inviteBody = {
        email,
        full_name: staffInviteForm.full_name.trim() || null,
        role,
        app_next: appNextByRole[role],
      };

      if (role === 'crew' && crewMemberId) {
        inviteBody.crew_member_id = crewMemberId;
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: inviteBody,
      });

      if (error) {
        console.error('[CrewAdmin] Invite error:', {
          error,
          message: error.message,
          context: error.context,
          status: error.status,
        });
        
        // Try to extract error message from response body
        let errorMessage = error.message || 'Failed to send staff invite';
        if (error.context?.body) {
          try {
            const errorBody = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body)
              : error.context.body;
            if (errorBody?.message) {
              errorMessage = errorBody.message;
            } else if (errorBody?.error) {
              errorMessage = errorBody.error;
            }
          } catch (e) {
            console.warn('[CrewAdmin] Could not parse error body:', e);
          }
        }
        
        toast.error(errorMessage);
        return;
      }

      if (data?.status === 'already_registered') {
        toast.success('This user already has an account.', { icon: 'ℹ️' });
      } else {
        toast.success('Staff invite sent!');
      }

      setStaffInviteForm({ full_name: '', email: '', role: 'crew' });
      fetchCrew(); // Refresh crew list to show new member
    } catch (err) {
      console.error('Error inviting internal staff:', err);
      toast.error(err?.message || 'Failed to send staff invite');
    } finally {
      setInvitingStaff(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${crewLabel} Members`}
        subtitle="Manage crew members, invite staff, and create user accounts."
      />

      {/* Plan Usage */}
      <LimitCard
        label="Crew Members"
        current={usage.current_crew}
        limit={limits.max_crew}
        isLoading={limitsLoading}
      />

      {/* Approaching Limit Warning */}
      <LimitWarningBanner
        label="Crew Members"
        current={usage.current_crew}
        limit={limits.max_crew}
        isLoading={limitsLoading}
      />

      <div className="bg-white rounded shadow p-4">
        <h2 className="text-lg font-semibold mb-1">Invite Internal Staff</h2>
        <p className="text-sm text-slate-600 mb-4">
          Send a secure invite and assign an initial internal role.
        </p>
        <form onSubmit={inviteInternalStaff} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            name="full_name"
            value={staffInviteForm.full_name}
            onChange={onStaffInviteChange}
            placeholder="Full name (optional)"
            className="border p-2 rounded"
            disabled={billingDisabled}
            readOnly={billingDisabled}
          />
          <input
            name="email"
            value={staffInviteForm.email}
            onChange={onStaffInviteChange}
            placeholder="Email"
            className="border p-2 rounded"
            type="email"
            required
            disabled={billingDisabled}
            readOnly={billingDisabled}
          />
          <select
            name="role"
            value={staffInviteForm.role}
            onChange={onStaffInviteChange}
            className="border p-2 rounded"
            disabled={billingDisabled}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="crew">Crew</option>
          </select>
          <BillingGuard>
            <Button disabled={invitingStaff || billingDisabled} variant="primary" className="px-4 py-2" title={billingDisabled ? billingReason : undefined}>
              {invitingStaff ? 'Sending…' : 'Send Invite'}
            </Button>
          </BillingGuard>
        </form>
      </div>

      <form onSubmit={saveCrew} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <input name="full_name" value={form.full_name} onChange={onChange} placeholder="Full name" className="border p-2 rounded" disabled={billingDisabled} readOnly={billingDisabled} />
        <input name="email" value={form.email} onChange={onChange} placeholder="Email" className="border p-2 rounded" disabled={billingDisabled} readOnly={billingDisabled} />
        <input name="phone" value={form.phone} onChange={onChange} placeholder="Phone" className="border p-2 rounded" disabled={billingDisabled} readOnly={billingDisabled} />
        <select name="role" value={form.role} onChange={onChange} className="border p-2 rounded" disabled={billingDisabled}>
          <option value="crew">Crew</option>
          <option value="lead">Lead</option>
        </select>
        <BillingGuard>
          <Button disabled={loading || billingDisabled} variant="primary" className="px-4 py-2" title={billingDisabled ? billingReason : undefined}>
            {editingId ? 'Update' : 'Add'}
          </Button>
        </BillingGuard>
      </form>

      {crew.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={`No ${crewLabel.toLowerCase()} members yet`}
            description={`Add ${crewLabel.toLowerCase()} members to assign work and track job completion. You can invite staff or create accounts manually.`}
            actionLabel={`Add ${crewLabel} Member`}
            onAction={supportMode ? () => toast.error(`${crewLabel} creation is disabled in support mode.`) : (billingDisabled ? () => toast.error(billingReason || `${crewLabel} creation is disabled due to billing status.`) : () => {})}
          />
        </Card>
      ) : (
        <div className="overflow-x-auto bg-white rounded shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Phone</th>
                <th className="p-2 text-left">Role</th>
                <th className="p-2 text-left">Linked</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {crew.map(row => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.full_name}</td>
                <td className="p-2">{row.email || '—'}</td>
                <td className="p-2">{row.phone || '—'}</td>
                <td className="p-2">{row.role || 'crew'}</td>
                <td className="p-2">{row.user_id ? '✅' : '❌'}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <BillingGuard>
                      <Button onClick={() => editCrew(row)} variant="secondary" disabled={billingDisabled} title={billingDisabled ? billingReason : undefined}>Edit</Button>
                    </BillingGuard>
                    <BillingGuard>
                      <Button onClick={() => deleteCrew(row.id)} variant="danger" disabled={billingDisabled} title={billingDisabled ? billingReason : undefined}>Delete</Button>
                    </BillingGuard>
                    {!row.user_id && row.email && (
                      <>
                        <BillingGuard>
                          <Button 
                            onClick={() => handleCreateLogin(row)} 
                            variant="secondary"
                            disabled={supportMode || billingDisabled}
                            title={supportMode ? 'Password operations are disabled in support mode' : billingDisabled ? billingReason : 'Create login account with password'}
                          >
                            Create Login
                          </Button>
                        </BillingGuard>
                        <BillingGuard>
                          <Button 
                            onClick={() => inviteCrew(row)} 
                            variant="secondary"
                            disabled={supportMode || billingDisabled}
                            title={supportMode ? 'Invites are disabled in support mode' : billingDisabled ? billingReason : 'Send invite email (may hit rate limits)'}
                          >
                            Invite
                          </Button>
                        </BillingGuard>
                      </>
                    )}
                    {row.user_id && row.email && (
                      <BillingGuard>
                        <Button 
                          onClick={() => handleSetPassword(row)} 
                          variant="secondary"
                          disabled={supportMode || billingDisabled}
                          title={supportMode ? 'Password operations are disabled in support mode' : billingDisabled ? billingReason : 'Set or reset password for crew login'}
                        >
                          Set Password
                        </Button>
                      </BillingGuard>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog />
      <UpgradeLimitModal
        open={showUpgradeModal}
        limitType="crew"
        currentUsage={usage.current_crew}
        limit={limits.max_crew}
        plan={plan || 'starter'}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigate('/admin/billing');
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />

      {/* Set Password Modal */}
      {showPasswordModal && selectedCrewMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => !isSavingPassword && setShowPasswordModal(false)}>
          <div className="relative max-w-md w-full mx-4 bg-white rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {passwordModalMode === 'create' ? 'Create Crew Login' : 'Set Password'} for {selectedCrewMember.full_name}
              </h3>
              <Button
                variant="tertiary"
                onClick={() => !isSavingPassword && setShowPasswordModal(false)}
                className="p-1"
                disabled={isSavingPassword}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {modalSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {modalSuccess}
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {modalError}
                </div>
              )}

              <div>
                <label htmlFor="tempPassword" className="block text-sm font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  id="tempPassword"
                  type="text"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Enter or generate password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSavingPassword || billingDisabled}
                  readOnly={billingDisabled}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Minimum 8 characters. Crew member can log in at /login with this password.
                </p>
              </div>

              <div className="flex gap-2">
                <BillingGuard>
                  <Button
                    variant="secondary"
                    onClick={() => setTempPassword(generatePassword())}
                    disabled={isSavingPassword || billingDisabled}
                    className="flex-1"
                    title={billingDisabled ? billingReason : undefined}
                  >
                    Generate Password
                  </Button>
                </BillingGuard>
                <BillingGuard>
                  <Button
                    variant="primary"
                    onClick={handleSavePassword}
                    disabled={!tempPassword.trim() || isSavingPassword || billingDisabled}
                    className="flex-1"
                    title={billingDisabled ? billingReason : undefined}
                  >
                    {isSavingPassword 
                      ? (passwordModalMode === 'create' ? 'Creating...' : 'Saving...')
                      : (passwordModalMode === 'create' ? 'Create Crew Login' : 'Save Password')
                    }
                  </Button>
                </BillingGuard>
              </div>

              <Button
                variant="tertiary"
                onClick={() => setShowPasswordModal(false)}
                disabled={isSavingPassword}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}