import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import CustomerAppShell from '../../layouts/customer/CustomerAppShell'
import { useBrand } from '../../context/BrandContext'
import QuoteCard from '../../components/customer/QuoteCard'
import LoadingSkeleton from '../../components/customer/LoadingSkeleton'
import EmptyState from '../../components/customer/EmptyState'
import Button from '../../components/ui/Button'
import { FileText } from 'lucide-react'

export default function QuotesListPage() {
  const { brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState([])
  const [filter, setFilter] = useState('all') // all, sent, accepted, rejected

  useEffect(() => {
    loadQuotes()
  }, [filter])

  async function loadQuotes() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!customer) {
        setLoading(false)
        return
      }

      let query = supabase
        .from('quotes')
        .select(`
          id,
          quote_number,
          services,
          subtotal,
          tax,
          total,
          status,
          notes,
          created_at,
          sent_at,
          accepted_at,
          rejected_at,
          expires_at,
          valid_until,
          converted_job_id
        `)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })

      // Apply filter
      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) {
        // If RLS policy not enabled, show empty state
        if (error.code === '42501' || error.message.includes('policy')) {
          console.warn('Quotes RLS policy not enabled for customers')
          setQuotes([])
        } else {
          throw error
        }
      } else {
        setQuotes(data || [])
      }
    } catch (err) {
      console.error('Error loading quotes:', err)
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerAppShell title="Quotes">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={filter === 'all' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Quotes
          </Button>
          <Button
            variant={filter === 'sent' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('sent')}
          >
            Pending
          </Button>
          <Button
            variant={filter === 'accepted' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('accepted')}
          >
            Accepted
          </Button>
          <Button
            variant={filter === 'rejected' ? 'primary' : 'tertiary'}
            size="sm"
            onClick={() => setFilter('rejected')}
          >
            Rejected
          </Button>
        </div>

        {/* Quotes List */}
        {loading ? (
          <LoadingSkeleton count={3} />
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotes found"
            description={
              filter === 'all'
                ? "You don't have any quotes yet. Contact us to request a quote!"
                : `You don't have any ${filter} quotes.`
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} />
            ))}
          </div>
        )}
      </div>
    </CustomerAppShell>
  )
}
