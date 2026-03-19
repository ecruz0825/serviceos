import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DispatchCenterAdmin from './DispatchCenterAdmin';
import ScheduleAdmin from './ScheduleAdmin';
import RoutePlanningAdmin from './RoutePlanningAdmin';
import SchedulingCenterAdmin from './SchedulingCenterAdmin';
import JobIntelligenceAdmin from './JobIntelligenceAdmin';

const TABS = [
  { 
    id: 'today', 
    label: 'Today', 
    component: DispatchCenterAdmin,
    description: 'Operational overview for today\'s services'
  },
  { 
    id: 'schedule', 
    label: 'Schedule', 
    component: ScheduleAdmin,
    description: 'Calendar-based job scheduling and assignment'
  },
  { 
    id: 'routes', 
    label: 'Routes', 
    component: RoutePlanningAdmin,
    description: 'View and generate individual team routes for specific dates'
  },
  { 
    id: 'automation', 
    label: 'Automation', 
    component: SchedulingCenterAdmin,
    description: 'Recurring job generation and scheduling pipeline'
  },
  { 
    id: 'intelligence', 
    label: 'Intelligence', 
    component: JobIntelligenceAdmin,
    description: 'Operational insights and risk signals'
  },
];

const DEFAULT_TAB = 'today';

export default function OperationsCenterAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get('tab') || DEFAULT_TAB;

  // Validate tab - redirect to default if invalid
  useEffect(() => {
    const validTabs = TABS.map(t => t.id);
    if (activeTab && !validTabs.includes(activeTab)) {
      setSearchParams({ tab: DEFAULT_TAB });
    }
  }, [activeTab, setSearchParams]);

  const handleTabChange = (tabId) => {
    // Clear ScheduleAdmin's internal scheduleTab param when switching away from schedule
    const newParams = new URLSearchParams(searchParams);
    if (tabId !== 'schedule' && activeTab === 'schedule') {
      newParams.delete('scheduleTab'); // Clear ScheduleAdmin's scheduleTab param
    }
    newParams.set('tab', tabId);
    setSearchParams(newParams);
  };

  const activeTabConfig = TABS.find(t => t.id === activeTab) || TABS[0];
  const ActiveComponent = activeTabConfig.component;

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-4" aria-label="Operations tabs">
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

      {/* Tab Content */}
      <div>
        <ActiveComponent />
      </div>
    </div>
  );
}
