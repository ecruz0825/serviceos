import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import RevenueHub from './RevenueHub';
import FinancialControlCenterAdmin from './FinancialControlCenterAdmin';

const TABS = [
  { 
    id: 'pipeline', 
    label: 'Pipeline', 
    component: RevenueHub, 
    description: 'Work through quotes, jobs, invoices, and collections queues',
    focusSection: 'pipeline'
  },
  { 
    id: 'collections', 
    label: 'Collections', 
    component: RevenueHub, 
    description: 'Collections operations, cases, follow-ups, and escalations',
    focusSection: 'collections'
  },
  { 
    id: 'analytics', 
    label: 'Analytics', 
    component: RevenueHub, 
    description: 'Financial snapshots, trends, AR aging, and cash forecasts',
    focusSection: 'analytics'
  },
  { 
    id: 'intelligence', 
    label: 'Intelligence', 
    component: FinancialControlCenterAdmin, 
    description: 'Financial risk alerts and payment attention items'
  },
];

const DEFAULT_TAB = 'pipeline';

export default function FinanceHubAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || DEFAULT_TAB;

  // Validate tab - redirect to default if invalid
  useEffect(() => {
    const validTabs = TABS.map(t => t.id);
    if (activeTab && !validTabs.includes(activeTab)) {
      setSearchParams({ tab: DEFAULT_TAB });
    }
  }, [activeTab, setSearchParams]);

  const handleTabChange = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const activeTabConfig = TABS.find(t => t.id === activeTab) || TABS[0];
  const ActiveComponent = activeTabConfig.component;
  const showFullRevenueHub = ['pipeline', 'collections', 'analytics'].includes(activeTab);
  const isIntelligence = activeTab === 'intelligence';

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 md:p-5 ${isIntelligence ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-gradient-to-b from-white to-slate-50/60'}`}>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900">Finance Workspace</h1>
          <p className="mt-1 text-sm text-slate-600">
            Switch modes to manage pipeline execution, collections workflow, analytics, and risk attention from one finance workspace.
          </p>
        </div>

        {/* Mode Navigation */}
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <nav className="grid grid-cols-2 gap-1 md:grid-cols-4" aria-label="Finance modes">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const isIntelligenceTab = tab.id === 'intelligence';
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    rounded-md px-3 py-2 text-sm font-medium transition-all
                    ${isActive
                      ? (isIntelligenceTab
                        ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                        : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200')
                      : (isIntelligenceTab
                        ? 'text-amber-700 hover:bg-amber-50'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')
                    }
                  `}
                  title={tab.description}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mode Description */}
        {activeTabConfig.description && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${isIntelligence ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <span className="font-medium">{activeTabConfig.label} Mode:</span> {activeTabConfig.description}
          </div>
        )}

        {/* Contextual guidance for RevenueHub tabs */}
        {showFullRevenueHub && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {activeTab === 'pipeline' && (
              <p>
                <strong>Pipeline View:</strong> Work through your revenue pipeline from top to bottom.
                Start with quotes, then jobs, then invoices, and finally collections. Each row shows the next recommended action.
              </p>
            )}
            {activeTab === 'collections' && (
              <p>
                <strong>Collections View:</strong> Focus on collections operations below.
                Review the collections queue, manage cases, set follow-ups, and track escalations.
              </p>
            )}
            {activeTab === 'analytics' && (
              <p>
                <strong>Analytics View:</strong> Review financial snapshots, trends, AR aging, and cash forecasts below.
                Use these metrics to understand your financial health and make informed decisions.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-200/70 bg-white p-3 sm:p-4 md:p-5">
        <ActiveComponent />
      </div>
    </div>
  );
}
