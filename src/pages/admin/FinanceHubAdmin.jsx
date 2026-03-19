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

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-4" aria-label="Finance tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }
              `}
              title={tab.description}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Description */}
      {activeTabConfig.description && (
        <p className="text-sm text-slate-600 -mt-2">
          {activeTabConfig.description}
        </p>
      )}

      {/* Contextual guidance for RevenueHub tabs */}
      {showFullRevenueHub && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
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

      {/* Tab Content */}
      <div>
        <ActiveComponent />
      </div>
    </div>
  );
}
