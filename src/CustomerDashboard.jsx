import { uploadImage } from './services/storage'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from './supabaseClient'
import jsPDF from 'jspdf'

function App() {
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState({ full_name: '', address: '', phone: '', email: '' })
  const [errorMsg, setErrorMsg] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'full_name', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [crewStats, setCrewStats] = useState([])

  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [jobs, setJobs] = useState([])
  const [jobForm, setJobForm] = useState({
    service_date: '',
    services_performed: '',
    notes: '',
    status: 'Pending',
    job_cost: '',
    crew_pay: '', // <<=== NEW FIELD
    before_file: null,
    after_file: null,
    assigned_team_id: ''
  })
  const [companyId, setCompanyId] = useState(null)
  const [teams, setTeams] = useState([])
  const [crewMembers, setCrewMembers] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [editingJobId, setEditingJobId] = useState(null)
  const [jobFilter, setJobFilter] = useState('All')

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'Cash',
    payment_date: '',
    notes: ''
  })

  const ITEMS_PER_PAGE = 5

  useEffect(() => { 
    loadCompanyId();
    // loadCustomers and loadCrewStats will be called after companyId is loaded
  }, [])

  useEffect(() => {
    if (companyId) {
      loadCustomers();
      loadCrewStats();
    }
  }, [companyId])

  useEffect(() => {
    if (companyId) {
      loadTeams();
      loadCrewMembers();
    }
  }, [companyId])

  async function loadCustomers() {
    if (!companyId) return; // Wait for companyId to be loaded
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId) // Defense-in-depth: scope to company
    if (error) setErrorMsg('Failed to fetch customers.')
    else setCustomers(data || [])
  }

  async function loadCrewStats() {
    const { data: crew } = await supabase.from('crew_members').select('id, full_name')
    if (!crew) return
    // Load crew stats by team assignment
    const stats = []
    for (let team of teams) {
      // Get jobs assigned to this team
      const { data: jobs } = await supabase
        .from('jobs')
        .select('job_cost')
        .eq('assigned_team_id', team.id)
        .eq('status', 'Completed')
      const earnings = jobs?.reduce((s, j) => s + parseFloat(j.job_cost || 0), 0) || 0
      stats.push({ ...team, earnings, completedJobs: jobs?.length || 0 })
    }
    setCrewStats(stats)
  }

  async function loadCompanyId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();
    
    if (profile?.company_id) {
      setCompanyId(profile.company_id);
    }
  }

  async function loadTeams() {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('teams')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name');
    
    if (error) {
      console.error('Error fetching teams:', error);
      setTeams([]);
    } else {
      setTeams(data || []);
      
      // Fetch team_members for assignee resolution
      if (data && data.length > 0) {
        const teamIds = data.map(t => t.id);
        const { data: teamMembersData, error: teamMembersError } = await supabase
          .from('team_members')
          .select('*, crew_members(id, full_name)')
          .in('team_id', teamIds);
        
        if (teamMembersError) {
          console.error('Error fetching team members:', teamMembersError);
          setTeamMembers([]);
        } else {
          setTeamMembers(teamMembersData || []);
        }
      }
    }
  }

  async function loadCrewMembers() {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('crew_members')
      .select('id, full_name')
      .eq('company_id', companyId);
    
    if (error) {
      console.error('Error fetching crew members:', error);
      setCrewMembers([]);
    } else {
      setCrewMembers(data || []);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function addCustomer(e) {
    e.preventDefault()
    if (!companyId) {
      setErrorMsg('Company ID not loaded. Please refresh the page.')
      return
    }
    if (editingId) {
      await supabase
        .from('customers')
        .update(form)
        .eq('id', editingId)
        .eq('company_id', companyId) // Defense-in-depth: scope to company
      setEditingId(null)
    } else {
      await supabase
        .from('customers')
        .insert([{ ...form, company_id: companyId }]) // Include company_id in INSERT payload
    }
    setForm({ full_name: '', address: '', phone: '', email: '' })
    loadCustomers()
  }

  function handleEdit(cust) {
    setForm(cust)
    setEditingId(cust.id)
  }

  async function handleDelete(id) {
    if (!companyId) {
      setErrorMsg('Company ID not loaded. Please refresh the page.')
      return
    }
    await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId) // Defense-in-depth: scope to company
    loadCustomers()
  }

  async function savePayment(e) {
    e.preventDefault()
    if (!selectedJob) return

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id || null;

    // Get company_id from user's profile (required for RLS policy)
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', currentUserId)
      .single();

    if (!profile?.company_id) {
      alert('Unable to record payment – company not found.')
      return
    }

    const enteredAmount = parseFloat(paymentForm.amount || 0)
    const jobCost = parseFloat(selectedJob.job_cost || 0)

    const { data: payments } = await supabase.from('payments').select('amount').eq('job_id', selectedJob.id)
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
    const remainingBalance = Math.max(0, jobCost - totalPaid)

    let paymentAmount = enteredAmount
    let refund = 0
    if (enteredAmount > remainingBalance) {
      paymentAmount = remainingBalance
      refund = enteredAmount - remainingBalance
    }

    if (paymentAmount > 0) {
      await supabase.from('payments').insert([{
        job_id: selectedJob.id,
        amount: paymentAmount,
        payment_method: paymentForm.method,
        paid: true,
        date_paid: paymentForm.payment_date,
        notes: paymentForm.notes,
        received_by: currentUserId,
        company_id: profile.company_id,
        status: 'posted',
        paid_at: new Date().toISOString()
      }])
    }

    const newTotalPaid = totalPaid + paymentAmount
    if (newTotalPaid >= jobCost) {
      await supabase.from('jobs').update({ status: 'Completed' }).eq('id', selectedJob.id)
    }

    setIsPaymentModalOpen(false)
    setPaymentForm({ amount: '', method: 'Cash', payment_date: '', notes: '' })

    if (selectedCustomer) await loadJobs(selectedCustomer.id)

    if (refund > 0) alert(`Payment exceeded balance. Refund $${refund.toFixed(2)}`)
  }

  // Helper: Resolve assignee for a job (team-based only)
  const resolveAssignee = useMemo(() => {
    // Build team display name helper
    const getTeamDisplayName = (teamId) => {
      if (!teamId) return 'Unassigned';
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'Unassigned';
      
      // Check if team-of-one (single member)
      const members = teamMembers.filter(tm => tm.team_id === teamId);
      if (members.length === 1 && members[0].crew_members?.full_name) {
        return members[0].crew_members.full_name;
      }
      
      return team.name;
    };
    
    return (job) => {
      // If assigned_team_id exists, use it
      if (job.assigned_team_id) {
        return getTeamDisplayName(job.assigned_team_id);
      }
      
      // Unassigned
      return 'Unassigned';
    };
  }, [teams, teamMembers]);

  // Formatting helpers
  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'No date';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'No date';
    }
  };

  const formatMoney = (amount) => {
    const num = parseFloat(amount || 0);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  const formatAssignee = (job) => {
    const assignee = resolveAssignee(job);
    if (assignee === 'Unassigned') {
      return <span className="text-slate-500 italic">{assignee}</span>;
    }
    if (assignee.startsWith('Legacy: ')) {
      return <span className="text-amber-600">{assignee}</span>;
    }
    return <span className="font-semibold text-slate-800">{assignee}</span>;
  };

  function handleSort(key) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    )
  }

  function sortData(data) {
    return [...data].sort((a, b) => {
      const A = a[sortConfig.key] || ''
      const B = b[sortConfig.key] || ''
      return sortConfig.direction === 'asc' ? A.localeCompare(B) : B.localeCompare(A)
    })
  }

  const filteredCustomers = sortData(customers.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase())))
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE)
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  async function openJobsModal(customer) {
    setSelectedCustomer(customer)
    setIsJobModalOpen(true)
    await Promise.all([loadJobs(customer.id), loadCrewStats()])
  }


  async function loadJobs(customerId) {
    const { data: jobsData } = await supabase.from('jobs').select('*').eq('customer_id', customerId).order('service_date', { ascending: false })
    const jobIds = jobsData.map(j => j.id)
    const { data: paymentsData } = await supabase.from('payments').select('job_id, amount, payment_method, date_paid, received_by').in('job_id', jobIds)
    
    // Collect unique received_by UUIDs and fetch profiles
    const receivedByIds = [...new Set(
      (paymentsData || [])
        .map(p => {
          // Handle both direct UUID and nested object cases
          const id = typeof p.received_by === 'object' ? p.received_by?.id : p.received_by;
          // Convert to string if not already
          return id ? String(id) : null;
        })
        .filter(id => id !== null && id !== undefined && id !== '' && typeof id === 'string')
    )]
    
    let profilesById = {}
    if (receivedByIds.length > 0) {
      try {
        console.log('[CustomerDashboard] Fetching profiles for received_by UUIDs:', receivedByIds.length, receivedByIds);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', receivedByIds)
        
        if (profilesError) {
          console.error('Error fetching profiles for received_by:', profilesError.message);
          console.error('Profile error details:', profilesError);
        } else {
          console.log('[CustomerDashboard] Fetched profiles:', profilesData?.length || 0, profilesData);
          (profilesData || []).forEach(profile => {
            if (profile.id && profile.full_name) {
              // Ensure key is a string for consistent lookup
              profilesById[String(profile.id)] = profile.full_name;
            }
          });
          console.log('[CustomerDashboard] Built profilesById map with', Object.keys(profilesById).length, 'entries:', profilesById);
        }
      } catch (err) {
        console.error('Error fetching profiles for received_by:', err)
      }
    } else {
      console.log('[CustomerDashboard] No received_by UUIDs found in payments');
    }
    
    // Decorate payments with received_by_name
    const paymentsWithNames = (paymentsData || []).map(payment => {
      const receivedById = typeof payment.received_by === 'object' ? payment.received_by?.id : payment.received_by;
      const receivedByIdStr = receivedById ? String(receivedById) : null;
      return {
        ...payment,
        received_by_name: receivedByIdStr ? (profilesById[receivedByIdStr] || null) : null
      };
    })
    
    let paymentsByJob = {}
    paymentsWithNames.forEach(p => {
      if (!paymentsByJob[p.job_id]) paymentsByJob[p.job_id] = []
      paymentsByJob[p.job_id].push(p)
    })
    const jobsWithTotals = jobsData.map(job => {
      const jobPayments = paymentsByJob[job.id] || []
      const totalPaid = jobPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
      const jobCost = parseFloat(job.job_cost || 0)
      let computedStatus = job.status
      if (totalPaid >= jobCost && jobCost > 0) computedStatus = 'Completed'
      return { ...job, payments: jobPayments, totalPaid, computedStatus }
    })
    setJobs(jobsWithTotals)
  }

  function handleJobFormChange(e) {
    const { name, value, type, files } = e.target
    setJobForm(prev => ({ ...prev, [name]: type === 'file' ? files[0] : value }))
  }
  const totalCustomers = customers.length
  const totalJobs = jobs.length
  const completedJobs = jobs.filter(j => j.computedStatus === 'Completed').length
  const totalBalance = jobs.reduce((sum, j) => {
    const cost = parseFloat(j.job_cost || 0)
    const paid = parseFloat(j.totalPaid || 0)
    return sum + (cost - paid)
  }, 0)

  async function addOrUpdateJob(e) {
  e.preventDefault()
  if (!selectedCustomer) return

  const before_image = await uploadImage(jobForm.before_file)
  const after_image = await uploadImage(jobForm.after_file)

  const jobData = {
    customer_id: selectedCustomer.id,
    service_date: jobForm.service_date,
    services_performed: jobForm.services_performed,
    job_cost: jobForm.job_cost,
    crew_pay: jobForm.crew_pay,   // <-- ADD THIS LINE
    notes: jobForm.notes,
    status: jobForm.status,
    assigned_team_id: jobForm.assigned_team_id || null,
    before_image,
    after_image
  }

  let error
  if (editingJobId) {
    ({ error } = await supabase.from('jobs').update(jobData).eq('id', editingJobId))
    setEditingJobId(null)
  } else {
    ({ error } = await supabase.from('jobs').insert([jobData]))
  }

  if (error) console.error(error)

  setJobForm({
    service_date: '',
    services_performed: '',
    job_cost: '',
    crew_pay: '', // reset
    notes: '',
    status: 'Pending',
    before_file: null,
    after_file: null,
    assigned_team_id: ''
  })

  loadJobs(selectedCustomer.id)
}

  async function handleDeleteJob(id) {
    await supabase.from('jobs').delete().eq('id', id)
    loadJobs(selectedCustomer.id)
    loadCrewStats()
  }

  // Filter and sort jobs: split into upcoming and past
  const { upcomingJobs, pastJobs } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Apply status filter first
    const filtered = jobFilter === 'All' ? jobs : jobs.filter(j => j.status === jobFilter);
    
    // Split by date
    const upcoming = filtered.filter(job => {
      if (!job.service_date) return false;
      const jobDate = new Date(job.service_date);
      jobDate.setHours(0, 0, 0, 0);
      return jobDate >= today;
    }).sort((a, b) => {
      const dateA = new Date(a.service_date || 0);
      const dateB = new Date(b.service_date || 0);
      return dateA - dateB; // ASC for upcoming
    });
    
    const past = filtered.filter(job => {
      if (!job.service_date) return true; // No date goes to past
      const jobDate = new Date(job.service_date);
      jobDate.setHours(0, 0, 0, 0);
      return jobDate < today;
    }).sort((a, b) => {
      const dateA = new Date(a.service_date || 0);
      const dateB = new Date(b.service_date || 0);
      return dateB - dateA; // DESC for past
    });
    
    return { upcomingJobs: upcoming, pastJobs: past };
  }, [jobs, jobFilter]);

  async function generateInvoice(job) {
    const customer = selectedCustomer
    const doc = new jsPDF()

    // Add logo
    try {
      const res = await fetch("/logo.png")
      const blob = await res.blob()
      const reader = new FileReader()
      await new Promise(resolve => {
        reader.onload = () => {
          doc.addImage(reader.result, "PNG", 14, 10, 30, 30)
          resolve()
        }
        reader.readAsDataURL(blob)
      })
    } catch {}

    doc.setFontSize(12)
    doc.text("Your Company Name", 50, 15)
    doc.text("123 Business Rd, City, State", 50, 21)
    doc.text("Phone: 123-456-7890 | Email: info@company.com", 50, 27)

    // Title
    doc.setFontSize(22)
    doc.setFont("helvetica", "bold")
    doc.text("INVOICE", 190, 20, null, null, "right")
    doc.setFont("helvetica", "normal")

    // Customer info
    doc.setFontSize(14)
    doc.text("Bill To:", 14, 50)
    doc.setFontSize(12)
    doc.text(`${customer.full_name}`, 14, 56)
    doc.text(`${customer.address}`, 14, 62)
    doc.text(`${customer.phone}`, 14, 68)

    const lineGap = 5
    const valueX = 40
    let detailY = 95
    const boldLabel = (label, value, y) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, 14, y)
      doc.setFont("helvetica", "normal")
      doc.text(value, valueX, y)
    }

    boldLabel("Date:", `${job.service_date}`, detailY)
    boldLabel("Service:", `${job.services_performed}`, detailY + lineGap)
    boldLabel("Status:", `${job.status}`, detailY + lineGap * 2)
    boldLabel("Cost:", `$${job.job_cost}`, detailY + lineGap * 3)
    boldLabel("Notes:", `${job.notes || ''}`, detailY + lineGap * 4)

    const remaining = parseFloat(job.job_cost || 0) - parseFloat(job.totalPaid || 0)

    // Draw a box for Payment Summary
    const summaryTop = detailY + lineGap * 6
    doc.setDrawColor(0)
    doc.setLineWidth(0.5)
    doc.rect(12, summaryTop, 185, 35)

    doc.setFontSize(13)
    doc.setFont("helvetica", "bold")
    doc.text("Payment Summary", 16, summaryTop + 8)
    doc.setFontSize(12)
    doc.setFont("helvetica", "normal")
    doc.text(`Total Paid: $${job.totalPaid || 0}`, 16, summaryTop + 18)
    doc.text(`Remaining Balance: $${remaining > 0 ? remaining : 0}`, 16, summaryTop + 28)

    // Images
    const imageStartY = summaryTop + 50
    const addImageFromUrl = async (url, x, y, label) => {
      if (!url) return
      const res = await fetch(url)
      const blob = await res.blob()
      const reader = new FileReader()
      await new Promise(r => {
        reader.onload = () => {
          doc.text(label, x, y - 5)
          doc.addImage(reader.result, "JPEG", x, y, 80, 60)
          r()
        }
        reader.readAsDataURL(blob)
      })
    }

    await addImageFromUrl(job.before_image, 14, imageStartY, "Before")
    await addImageFromUrl(job.after_image, 110, imageStartY, "After")

    doc.save(`invoice_${customer.full_name}_${job.service_date}.pdf`)
  }
return (
    
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-8">
      <a href="/crew" className="underline text-blue-600 block mb-4">Go to Worker Portal</a>

      <h1 className="text-4xl font-extrabold mb-10 drop-shadow-lg" style={{ color: "var(--brand-secondary, var(--brand-primary))" }}>
        Customer Dashboard
      </h1>

      {/* Crew Stats */}
      <div className="mb-8 p-4 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Worker Stats</h2>
        {crewStats.length === 0 ? (
          <p>No crew data.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {crewStats.map(stat => (
              <div key={stat.id} className="p-4 border rounded shadow">
                <h3 className="text-lg font-semibold">{stat.full_name}</h3>
                <p>Completed Jobs: {stat.completedJobs}</p>
                <p>Total Earnings: ${stat.earnings.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500">Total Customers</p>
          <p className="text-2xl font-bold">{totalCustomers}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500">Total Jobs</p>
          <p className="text-2xl font-bold">{totalJobs}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500">Completed Jobs</p>
          <p className="text-2xl font-bold">{completedJobs}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500">Outstanding Balance</p>
          <p className="text-2xl font-bold text-red-600">${totalBalance.toFixed(2)}</p>
        </div>
      </div>

      {/* Search input */}
      <input
        type="text"
        placeholder="Search by name..."
        value={search}
        onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
        className="border rounded-lg shadow-sm p-3 mb-6 w-full focus:ring-2 focus:ring-green-400"
      />

      {/* Add Customer form */}
      <form
        onSubmit={addCustomer}
        className="bg-white p-6 rounded-xl shadow-lg grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10"
      >
        <input name="full_name" placeholder="Full Name" value={form.full_name} onChange={handleChange}
          className="border rounded-lg p-2 focus:ring-2 focus:ring-green-400" />
        <input name="address" placeholder="Address" value={form.address} onChange={handleChange}
          className="border rounded-lg p-2 focus:ring-2 focus:ring-green-400" />
        <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange}
          className="border rounded-lg p-2 focus:ring-2 focus:ring-green-400" />
        <input type="email" name="email" placeholder="Email" value={form.email} onChange={handleChange}
          className="border rounded-lg p-2 focus:ring-2 focus:ring-green-400" />
        <button type="submit"
          className="col-span-1 sm:col-span-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition">
          {editingId ? 'Update Customer' : 'Add Customer'}
        </button>
      </form>

      {/* Customers table */}
      <div className="overflow-x-auto bg-white shadow rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-green-200 sticky top-0">
            <tr>
              {['full_name', 'address', 'phone', 'email'].map(key => (
                <th key={key} onClick={() => handleSort(key)}
                  className="border px-4 py-3 cursor-pointer text-left font-semibold uppercase">
                  {key}
                </th>
              ))}
              <th className="border px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-green-100">
            {paginatedCustomers.map(c => (
              <tr key={c.id} className="hover:bg-green-50">
                <td className="border px-4 py-2">{c.full_name}</td>
                <td className="border px-4 py-2">{c.address}</td>
                <td className="border px-4 py-2">{c.phone}</td>
                <td className="border px-4 py-2">{c.email}</td>
                <td className="border px-4 py-2">
                  <button onClick={() => handleEdit(c)}
                    className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition mr-2">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className="px-3 py-1 rounded bg-red-500 hover:bg-red-600 text-white transition mr-2">
                    Delete
                  </button>
                  <button onClick={() => openJobsModal(c)}
                    className="px-3 py-1 rounded bg-green-500 hover:bg-green-600 text-white transition">
                    Jobs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Jobs modal */}
      {isJobModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-bold mb-6 text-green-800">
              Jobs for {selectedCustomer.full_name}
            </h2>

            {/* Job filter */}
            <div className="mb-6">
              <label className="mr-2 font-semibold">Filter:</label>
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                className="border p-2 rounded-lg focus:ring-2 focus:ring-green-400"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Add/Update job */}
            <form
              onSubmit={addOrUpdateJob}
              className="bg-green-50 p-4 rounded-lg shadow grid grid-cols-1 gap-3 mb-8"
            >
              <input type="text" name="services_performed" placeholder="Services Performed" value={jobForm.services_performed} onChange={handleJobFormChange}
                className="border rounded-lg p-2" />
              <input type="text" name="job_cost" placeholder="Job Cost" value={jobForm.job_cost} onChange={handleJobFormChange}
                className="border rounded-lg p-2" />
                <div>
                  <input
                    type="text"
                    name="crew_pay"
                    placeholder="Labor Pay"
                    value={jobForm.crew_pay}
                    onChange={handleJobFormChange}
                    className="border rounded-lg p-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">(internal)</p>
                </div>
              <input type="date" name="service_date" value={jobForm.service_date} onChange={handleJobFormChange}
                className="border rounded-lg p-2" />
              <select name="status" value={jobForm.status} onChange={handleJobFormChange}
                className="border rounded-lg p-2">
                <option>Pending</option>
                <option>Completed</option>
              </select>
              <label className="block text-sm font-medium text-gray-700">
                Assign Team
              </label>
              <select name="assigned_team_id" value={jobForm.assigned_team_id} onChange={handleJobFormChange}
                className="border rounded-lg p-2">
                <option value="">Unassigned</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input type="text" name="notes" placeholder="Notes" value={jobForm.notes} onChange={handleJobFormChange}
                className="border rounded-lg p-2" />

              <label className="text-gray-600">Before:
                <input type="file" name="before_file" onChange={handleJobFormChange}
                  className="block mt-1" />
              </label>
              <label className="text-gray-600">After:
                <input type="file" name="after_file" onChange={handleJobFormChange}
                  className="block mt-1" />
              </label>
              <button type="submit" className="col-span-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
                Add Job
              </button>
            </form>

            {/* Jobs list */}
            {(upcomingJobs.length > 0 || pastJobs.length > 0) ? (
              <>
                {upcomingJobs.length > 0 && (
                  <>
                    <h3 className="text-lg font-semibold mt-6 mb-2">Upcoming Jobs</h3>
                    <table className="min-w-full text-sm mb-6">
                      <thead className="bg-green-200">
                        <tr>
                          <th className="border px-4 py-3">Date</th>
                          <th className="border px-4 py-3">Service</th>
                          <th className="border px-4 py-3">Assigned To</th>
                          <th className="border px-4 py-3">Paid / Total</th>
                          <th className="border px-4 py-3">Status</th>
                          <th className="border px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingJobs.map(job => (
                          <tr key={job.id} className="hover:bg-green-50">
                            <td className="border px-4 py-2">{formatDate(job.service_date)}</td>
                            <td className="border px-4 py-2">{job.services_performed || '—'}</td>
                            <td className="border px-4 py-2">{formatAssignee(job)}</td>
                            <td className="border px-4 py-2">
                              <div>{formatMoney(job.totalPaid)} / {formatMoney(job.job_cost)}</div>
                              {job.totalPaid < job.job_cost && (
                                <div className="text-red-600 text-xs mt-1">
                                  Balance: {formatMoney(job.job_cost - job.totalPaid)}
                                </div>
                              )}
                            </td>
                            <td className="border px-4 py-2">
                              {job.computedStatus === 'Completed'
                                ? <span className="text-green-600 font-semibold">Completed</span>
                                : <span className="text-orange-600 font-semibold">Pending</span>}
                            </td>
                            <td className="border px-4 py-2">
                              {job.computedStatus !== 'Completed' && (
                                <button
                                  onClick={() => { setSelectedJob(job); setIsPaymentModalOpen(true) }}
                                  className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded mr-2">
                                  Record Payment
                                </button>
                              )}
                              {/* TODO: Legacy invoice generation. Prefer storage-backed invoice_path + signed URL like JobsAdmin/CustomerPortal. */}
                              <button onClick={() => generateInvoice(job)}
                                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded mr-2">
                                Invoice
                              </button>
                              <button onClick={() => handleDeleteJob(job.id)}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {pastJobs.length > 0 && (
                  <>
                    <h3 className="text-lg font-semibold mt-6 mb-2">Past Jobs</h3>
                    <table className="min-w-full text-sm">
                      <thead className="bg-green-200">
                        <tr>
                          <th className="border px-4 py-3">Date</th>
                          <th className="border px-4 py-3">Service</th>
                          <th className="border px-4 py-3">Assigned To</th>
                          <th className="border px-4 py-3">Paid / Total</th>
                          <th className="border px-4 py-3">Status</th>
                          <th className="border px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastJobs.map(job => (
                          <tr key={job.id} className="hover:bg-green-50">
                            <td className="border px-4 py-2">{formatDate(job.service_date)}</td>
                            <td className="border px-4 py-2">{job.services_performed || '—'}</td>
                            <td className="border px-4 py-2">{formatAssignee(job)}</td>
                            <td className="border px-4 py-2">
                              <div>{formatMoney(job.totalPaid)} / {formatMoney(job.job_cost)}</div>
                              {job.totalPaid < job.job_cost && (
                                <div className="text-red-600 text-xs mt-1">
                                  Balance: {formatMoney(job.job_cost - job.totalPaid)}
                                </div>
                              )}
                            </td>
                            <td className="border px-4 py-2">
                              {job.computedStatus === 'Completed'
                                ? <span className="text-green-600 font-semibold">Completed</span>
                                : <span className="text-orange-600 font-semibold">Pending</span>}
                            </td>
                            <td className="border px-4 py-2">
                              {job.computedStatus !== 'Completed' && (
                                <button
                                  onClick={() => { setSelectedJob(job); setIsPaymentModalOpen(true) }}
                                  className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded mr-2">
                                  Record Payment
                                </button>
                              )}
                              {/* TODO: Legacy invoice generation. Prefer storage-backed invoice_path + signed URL like JobsAdmin/CustomerPortal. */}
                              <button onClick={() => generateInvoice(job)}
                                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded mr-2">
                                Invoice
                              </button>
                              <button onClick={() => handleDeleteJob(job.id)}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            ) : (
              <p className="text-gray-500 mt-4">No jobs found.</p>
            )}

            <button
              onClick={() => setIsJobModalOpen(false)}
              className="mt-4 bg-gray-700 hover:bg-gray-800 text-white py-2 px-6 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {isPaymentModalOpen && selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-4">Record Payment</h2>
            <p><strong>Service:</strong> {selectedJob.services_performed}</p>
            <p><strong>Date:</strong> {selectedJob.service_date}</p>
            <p><strong>Cost:</strong> ${selectedJob.job_cost}</p>
            <p><strong>Status:</strong> {selectedJob.status}</p>

            <div className="my-4">
              Remaining Balance: ${(selectedJob.job_cost - selectedJob.totalPaid).toFixed(2)}
            </div>

            <div className="mb-4">
              <h3 className="font-semibold">Previous Payments</h3>
              {selectedJob.payments.length === 0 ? (
                <p className="text-gray-500">No payments recorded yet.</p>
              ) : (
                <ul className="list-disc list-inside">
                  {selectedJob.payments.map((p, i) => (
                    <li key={i}>
                      {p.date_paid}: ${p.amount} ({p.payment_method}){p.received_by_name ? ` - Received by: ${p.received_by_name}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={savePayment} className="grid gap-4">
              <input
                type="number"
                placeholder="Payment amount"
                value={paymentForm.amount}
                onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className="border rounded-lg p-2"
              />
              <select
                value={paymentForm.method}
                onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}
                className="border rounded-lg p-2"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Check">Check</option>
              </select>
              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                className="border rounded-lg p-2"
              />
              <textarea
                placeholder="Notes"
                value={paymentForm.notes}
                onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                className="border rounded-lg p-2"
              ></textarea>
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
                Save Payment
              </button>
              <button type="button" onClick={() => setIsPaymentModalOpen(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg">
                Close
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
