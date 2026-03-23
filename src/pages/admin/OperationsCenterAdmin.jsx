import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DispatchCenterAdmin from './DispatchCenterAdmin';
import ScheduleAdmin from './ScheduleAdmin';
import RoutePlanningAdmin from './RoutePlanningAdmin';
import SchedulingCenterAdmin from './SchedulingCenterAdmin';
import JobIntelligenceAdmin from './JobIntelligenceAdmin';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { Calendar, MapPin, ListTodo } from 'lucide-react';

const PRIMARY_TAB_IDS = ['today', 'schedule'];

const TABS = [
  {
    id: 'today',
    label: 'Today',
    component: DispatchCenterAdmin,
    description: "Operational overview for today's services",
    hint: "View today's scheduled jobs and current activity.",
  },
  {
    id: 'schedule',
    label: 'Schedule',
    component: ScheduleAdmin,
    description: 'Calendar-based job scheduling and assignment',
    hint: 'Assign and schedule upcoming jobs.',
  },
  {
    id: 'routes',
    label: 'Routes',
    component: RoutePlanningAdmin,
    description: 'View and generate individual team routes for specific dates',
    hint: 'Optimize crew routes and assignments.',
  },
  {
    id: 'automation',
    label: 'Automation',
    component: SchedulingCenterAdmin,
    description: 'Recurring job generation and scheduling pipeline',
    hint: 'Manage recurring and automated scheduling.',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    component: JobIntelligenceAdmin,
    description: 'Operational insights and risk signals',
    hint: 'Insights and performance data.',
  },
];

const QUICK_ACTIONS = [
  { label: 'Schedule Jobs', tab: 'schedule', icon: Calendar },
  { label: 'View Unscheduled', href: '/admin/jobs?quickFilter=unassigned', icon: ListTodo },
  { label: 'Open Route Planner', tab: 'routes', icon: MapPin },
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
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Operations"
        subtitle="Manage scheduling, dispatch, and daily operations in one place."
      />

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          if (action.tab) {
            return (
              <Button
                key={action.label}
                variant="tertiary"
                onClick={() => handleTabChange(action.tab)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
              </Button>
            );
          }
          return (
            <Button
              key={action.label}
              variant="tertiary"
              onClick={() => navigate(action.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
            >
              <Icon className="w-3.5 h-3.5" />
              {action.label}
            </Button>
          );
        })}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-1 sm:gap-2" aria-label="Operations tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isPrimary = PRIMARY_TAB_IDS.includes(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  py-3 px-3 sm:px-4 border-b-2 text-sm transition-colors rounded-t-lg
                  ${isActive
                    ? 'border-slate-900 text-slate-900 font-semibold bg-slate-50'
                    : isPrimary
                      ? 'border-transparent text-slate-700 font-medium hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50/60'
                      : 'border-transparent text-slate-500 font-medium hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
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

      {/* Tab Purpose Hint */}
      {activeTabConfig.hint && (
        <p className="text-sm text-slate-600 -mt-4">
          {activeTabConfig.hint}
        </p>
      )}

      {/* Default landing emphasis: Today's Operations */}
      {activeTab === 'today' && (
        <div className="flex items-center gap-2 -mt-2">
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Today's Operations
          </h2>
        </div>
      )}

      {/* Tab Content — consistent spacing and subtle separation */}
      <div className="pt-2 min-h-0">
        <ActiveComponent />
      </div>
    </div>
  );
}
