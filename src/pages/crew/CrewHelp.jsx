import { Link } from 'react-router-dom'
import { HelpCircle, Briefcase, Camera, CheckCircle, Phone, Mail } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import useCompanySettings from '../../hooks/useCompanySettings'

/**
 * CrewHelp - Simple help/support page for crew members
 */
export default function CrewHelp() {
  const { settings } = useCompanySettings()
  const supportEmail = settings?.support_email || ''
  const supportPhone = settings?.support_phone || ''
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Help & Support</h1>
        <p className="text-slate-600">Get help with using the Crew Portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/crew/jobs"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Briefcase className="w-5 h-5 text-slate-600" />
              <span className="text-slate-900">View All Jobs</span>
            </Link>
            <Link
              to="/crew/jobs?filter=needs_before_photos"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Camera className="w-5 h-5 text-slate-600" />
              <span className="text-slate-900">Jobs Needing Photos</span>
            </Link>
            <Link
              to="/crew/jobs?filter=ready_to_complete"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <CheckCircle className="w-5 h-5 text-slate-600" />
              <span className="text-slate-900">Ready to Complete</span>
            </Link>
          </div>
        </Card>

        {/* Common Questions */}
        <Card>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Common Questions</h2>
          <div className="space-y-4 text-sm text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How do I upload photos?</h3>
              <p className="text-slate-600">
                Open a job from the Jobs list, then use the "Upload Before Photo" or "Upload After Photo" buttons.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How do I mark a job as complete?</h3>
              <p className="text-slate-600">
                Once you've uploaded both before and after photos, you'll see a "Mark Complete" button on the job detail page.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How do I record a payment?</h3>
              <p className="text-slate-600">
                On the job detail page, scroll to the "Record Payment" section and enter the payment details.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Support Contact */}
      <Card>
        <div className="flex items-start gap-4">
          <HelpCircle className="w-6 h-6 text-slate-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Need More Help?</h2>
            <p className="text-slate-600 mb-4">
              If you need additional assistance, please contact your supervisor or company support.
            </p>
            <div className="space-y-3">
              {supportPhone && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="w-4 h-4" />
                  <a href={`tel:${supportPhone}`} className="text-sm hover:text-slate-900 underline">
                    {supportPhone}
                  </a>
                </div>
              )}
              {supportEmail && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${supportEmail}`} className="text-sm hover:text-slate-900 underline">
                    {supportEmail}
                  </a>
                </div>
              )}
              {!supportPhone && !supportEmail && (
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">Contact your supervisor</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">Email support</span>
                  </div>
                </div>
              )}
              {supportEmail && (
                <div className="pt-2">
                  <a
                    href={`mailto:${supportEmail}?subject=Issue Report - Crew Portal&body=Please describe the issue you're experiencing:`}
                    className="inline-block"
                  >
                    <Button variant="primary" className="btn-accent">
                      Report an Issue
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Back to Dashboard */}
      <div className="flex justify-center">
        <Link to="/crew">
          <Button variant="primary" className="btn-accent">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}
