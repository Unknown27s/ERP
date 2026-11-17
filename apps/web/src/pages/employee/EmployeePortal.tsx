import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/auth';
import { useBranding } from '../../hooks/branding';
import { downloadPayslipPdf } from '../../lib/payslipPdf';
import { downloadEmployeeReportPdf, downloadTasksCsv } from '../../lib/employeeReportPdf';
import {
  User,
  Clock,
  CheckCircle2,
  CalendarRange,
  Banknote,
  BarChart3,
  Camera,
  Plus,
  Trash2,
  Edit2,
  FileDown,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
  Tag as TagIcon,
  Timer,
  Play,
  Square,
  Building,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Hash,
  ShieldCheck,
  Search,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';

const TAG_COLORS: Record<string, string> = {
  development: '#3B82F6',
  bugfix: '#EF4444',
  'client-meeting': '#8B5CF6',
  support: '#10B981',
  review: '#F59E0B',
  documentation: '#06B6D4',
  admin: '#64748B',
  general: '#6B7280',
};

const DEFAULT_TAGS = [
  'development',
  'bugfix',
  'client-meeting',
  'support',
  'review',
  'documentation',
  'admin',
];

const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);

const money = (n: number | string | null | undefined) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EmployeePortal({ initialTab = 'profile' }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { user, refreshUser } = useAuth();
  const { brand } = useBranding();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 1. Data Queries ──────────────────────────────────────────────────────────
  const { data: meData, isLoading: meLoading, error: meError, refetch: refetchMe } = useQuery({
    queryKey: ['employee', 'me'],
    queryFn: () => api.get('/employee/me'),
  });

  const emp = meData?.data;

  const { data: clockData, refetch: refetchClock } = useQuery({
    queryKey: ['employee', 'clock'],
    queryFn: () => api.get('/employee/clock'),
    enabled: !!emp,
    refetchInterval: 15000,
  });

  const [taskFilterTag, setTaskFilterTag] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskDateRange, setTaskDateRange] = useState({ from: '', to: '' });

  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ['employee', 'tasks', taskFilterTag, taskSearch, taskDateRange],
    queryFn: () => {
      const q = new URLSearchParams();
      if (taskFilterTag && taskFilterTag !== 'all') q.set('tag', taskFilterTag);
      if (taskSearch) q.set('q', taskSearch);
      if (taskDateRange.from && taskDateRange.to) {
        q.set('from_date', taskDateRange.from);
        q.set('to_date', taskDateRange.to);
      }
      return api.get(`/employee/tasks?${q.toString()}`);
    },
    enabled: !!emp,
  });

  const { data: leavesData, refetch: refetchLeaves } = useQuery({
    queryKey: ['employee', 'leaves'],
    queryFn: () => api.get('/employee/leaves'),
    enabled: !!emp,
  });

  const { data: payslipsData } = useQuery({
    queryKey: ['employee', 'payslips'],
    queryFn: () => api.get('/employee/payslips'),
    enabled: !!emp,
  });

  const [reportPeriod, setReportPeriod] = useState(monthNow());
  const { data: reportData } = useQuery({
    queryKey: ['employee', 'reports', reportPeriod],
    queryFn: () => api.get(`/employee/reports/summary?period=${reportPeriod}`),
    enabled: !!emp,
  });

  // ── 2. Clock Actions ────────────────────────────────────────────────────────
  const [clockLoading, setClockLoading] = useState(false);
  const handleClock = async (action: 'in' | 'out') => {
    setClockLoading(true);
    try {
      await api.post('/employee/clock', { action });
      await refetchClock();
      await refetchMe();
      qc.invalidateQueries({ queryKey: ['employee'] });
    } catch (e: any) {
      alert(e?.message || `Failed to clock ${action}`);
    } finally {
      setClockLoading(false);
    }
  };

  // ── 3. Profile Photo Upload ──────────────────────────────────────────────────
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setUploadingPhoto(true);
      try {
        await api.patch('/employee/me', { photo_url: base64 });
        await refetchMe();
        await refreshUser();
      } catch (err: any) {
        alert(err?.message || 'Failed to update photo');
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── 4. Task Modal State ─────────────────────────────────────────────────────
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({
    task_title: '',
    description: '',
    tag: 'development',
    hours_spent: 1.0,
    work_date: today(),
    status: 'completed',
    project_or_lead_ref: '',
  });

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskForm({
      task_title: '',
      description: '',
      tag: 'development',
      hours_spent: 1.0,
      work_date: today(),
      status: 'completed',
      project_or_lead_ref: '',
    });
    setTaskModalOpen(true);
  };

  const openEditTask = (t: any) => {
    setEditingTask(t);
    setTaskForm({
      task_title: t.task_title,
      description: t.description || '',
      tag: t.tag || 'development',
      hours_spent: t.hours_spent || 1.0,
      work_date: t.work_date || today(),
      status: t.status || 'completed',
      project_or_lead_ref: t.project_or_lead_ref || '',
    });
    setTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.task_title.trim()) return alert('Task title is required');
    try {
      if (editingTask) {
        await api.patch(`/employee/tasks/${editingTask.id}`, taskForm);
      } else {
        await api.post('/employee/tasks', taskForm);
      }
      setTaskModalOpen(false);
      refetchTasks();
      qc.invalidateQueries({ queryKey: ['employee', 'reports'] });
    } catch (err: any) {
      alert(err?.message || 'Failed to save task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.del(`/employee/tasks/${id}`);
      refetchTasks();
      qc.invalidateQueries({ queryKey: ['employee', 'reports'] });
    } catch (err: any) {
      alert(err?.message || 'Failed to delete task');
    }
  };

  // ── 5. Leave Application State ──────────────────────────────────────────────
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: '',
    from_date: today(),
    to_date: today(),
    reason: '',
  });

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.leave_type_id) return alert('Select a leave type');
    try {
      await api.post('/employee/leaves', leaveForm);
      setLeaveModalOpen(false);
      refetchLeaves();
      alert('Leave application submitted for approval');
    } catch (err: any) {
      alert(err?.message || 'Failed to submit leave application');
    }
  };

  const handleCancelLeave = async (id: string) => {
    if (!confirm('Cancel this pending leave request?')) return;
    try {
      await api.del(`/employee/leaves/${id}`);
      refetchLeaves();
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel leave request');
    }
  };

  // ── 6. Payslip View State ───────────────────────────────────────────────────
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

  // ── 7. Handle Unlinked Accounts ─────────────────────────────────────────────
  if (meLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading your employee portal…</span>
        </div>
      </div>
    );
  }

  if (meError || !emp) {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Employee Profile Not Linked</h2>
          <p className="text-sm text-slate-500">
            Your login account (<strong>{user?.email}</strong>) is not yet linked to an employee record in this company.
          </p>
          <p className="text-xs text-slate-400">
            Please ask HR or your administrator to link your profile under <strong>Human Resources → Employees</strong>.
          </p>
        </div>
      </div>
    );
  }

  const isClockedIn = clockData?.data?.is_clocked_in || false;
  const clockedHoursToday = clockData?.data?.total_hours_today || 0;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* ── Top Portal Header & Navigation Bar ───────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 lg:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-brand-50 border-2 border-brand-200/80 flex items-center justify-center shrink-0 shadow-sm">
              {emp.photo_url ? (
                <img src={emp.photo_url} alt={emp.full_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-brand-600">
                  {emp.full_name?.slice(0, 2)?.toUpperCase() || 'EM'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload picture"
              className="absolute -bottom-1 -right-1 bg-brand-600 text-white p-1.5 rounded-full shadow-md hover:bg-brand-700 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{emp.full_name}</h1>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                {emp.emp_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {emp.designation_name || 'Staff'} • {emp.department_name || 'General'}
            </p>
          </div>
        </div>

        {/* Live Clock In / Clock Out Quick Action */}
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <div className="text-xs">
              <div className="font-semibold text-slate-800">
                {isClockedIn ? 'Clocked In' : 'Clocked Out'}
              </div>
              <div className="text-[11px] text-slate-500">
                Today: {clockedHoursToday.toFixed(1)} hrs
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={clockLoading}
            onClick={() => handleClock(isClockedIn ? 'out' : 'in')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
              isClockedIn
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {isClockedIn ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Clock Out</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Clock In</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Sub-Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto pb-px">
        {[
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'tasks', label: 'Completed Tasks', icon: CheckCircle2 },
          { id: 'leaves', label: 'Leaves & Time Off', icon: CalendarRange },
          { id: 'payslips', label: 'Payslips & Salary', icon: Banknote },
          { id: 'reports', label: 'Work Reports & Charts', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-xs whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-brand-600 text-brand-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: Profile ───────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Profile Info Card */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Employment Details</h2>
                <p className="text-xs text-slate-500">Official company record and reporting line</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Employee
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Employee Code</div>
                <div className="font-semibold text-slate-800 text-sm">{emp.emp_code}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Joining Date</div>
                <div className="font-semibold text-slate-800 text-sm">{emp.joining_date}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Department</div>
                <div className="font-semibold text-slate-800 text-sm">{emp.department_name || '—'}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Designation</div>
                <div className="font-semibold text-slate-800 text-sm">{emp.designation_name || '—'}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Reporting Manager</div>
                <div className="font-semibold text-slate-800 text-sm">{emp.manager_name || 'None'}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="text-slate-400 font-medium">Employment Type</div>
                <div className="font-semibold text-slate-800 text-sm capitalize">{emp.employment_type?.replace('_', ' ')}</div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Contact & Identity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{emp.email || user?.email || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{emp.phone || 'No phone recorded'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{emp.address || 'No address recorded'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>PAN: {emp.pan || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Side Card: Today's Work Session & Bank Info */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-600" />
                <span>Today's Sessions</span>
              </h3>
              <div className="space-y-2 text-xs">
                {(clockData?.data?.today_sessions || []).length === 0 ? (
                  <p className="text-slate-400 italic">No work sessions logged today.</p>
                ) : (
                  clockData.data.today_sessions.map((s: any) => (
                    <div key={s.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">
                          {new Date(s.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {s.clock_out ? new Date(s.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                        </div>
                        <div className="text-[10px] text-slate-400">{s.notes || 'Normal shift'}</div>
                      </div>
                      <span className="font-semibold text-slate-700">
                        {s.total_minutes ? `${s.total_minutes}m` : 'Running'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-sm text-xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Bank Details</span>
              </h3>
              <div className="space-y-1.5 text-slate-600">
                <div>Account: <span className="font-mono font-semibold text-slate-800">{emp.bank_account || '—'}</span></div>
                <div>IFSC: <span className="font-mono font-semibold text-slate-800">{emp.bank_ifsc || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Tasks Completed ───────────────────────────────────────────── */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search tasks…"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 w-44"
                />
              </div>

              {/* Tag Filter Pills */}
              <select
                value={taskFilterTag}
                onChange={(e) => setTaskFilterTag(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                <option value="all">All Tags</option>
                {DEFAULT_TAGS.map((t) => (
                  <option key={t} value={t}>#{t}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openCreateTask}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Log Completed Task</span>
            </button>
          </div>

          {/* Tasks Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Task Title &amp; Details</th>
                    <th className="py-3 px-4">Tag</th>
                    <th className="py-3 px-4">Hours</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(tasksData?.data || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No completed tasks logged yet. Click <strong>"Log Completed Task"</strong> to add your work.
                      </td>
                    </tr>
                  ) : (
                    tasksData.data.map((t: any) => {
                      const tagColor = TAG_COLORS[t.tag] || '#6B7280';
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">{t.work_date}</td>
                          <td className="py-3 px-4 max-w-md">
                            <div className="font-semibold text-slate-900">{t.task_title}</div>
                            {t.description && (
                              <div className="text-slate-500 text-[11px] line-clamp-1">{t.description}</div>
                            )}
                            {t.project_or_lead_ref && (
                              <div className="text-[10px] text-brand-600 font-medium">Ref: {t.project_or_lead_ref}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white shadow-xs"
                              style={{ backgroundColor: tagColor }}
                            >
                              #{t.tag}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800">{Number(t.hours_spent || 0).toFixed(1)}h</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                              {t.status || 'completed'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            <button
                              type="button"
                              onClick={() => openEditTask(t)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Edit task"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(t.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Leaves & Time Off ─────────────────────────────────────────── */}
      {activeTab === 'leaves' && (
        <div className="space-y-6">
          {/* Leave Balances Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(leavesData?.data?.balances || []).map((b: any) => (
              <div key={b.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">{b.leave_type_name}</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {b.paid ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{b.balance} <span className="text-xs font-normal text-slate-400">days left</span></div>
                <div className="text-[11px] text-slate-500">
                  Entitled: {b.entitled} • Used: {b.used}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">My Leave Requests</h2>
            <button
              type="button"
              onClick={() => setLeaveModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Leave</span>
            </button>
          </div>

          {/* Leave Requests Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">From</th>
                  <th className="py-3 px-4">To</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(leavesData?.data?.requests || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No leave requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  leavesData.data.requests.map((l: any) => {
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-50 text-amber-700 border-amber-200',
                      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      rejected: 'bg-rose-50 text-rose-700 border-rose-200',
                      cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
                    };
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">{l.leave_type_name}</td>
                        <td className="py-3 px-4 text-slate-600">{l.from_date}</td>
                        <td className="py-3 px-4 text-slate-600">{l.to_date}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{l.days}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${statusColors[l.status] || ''}`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs text-slate-500">
                          <div>{l.reason || '—'}</div>
                          {l.decision_note && (
                            <div className="text-[10px] text-slate-400 italic">Approver: {l.decision_note}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {l.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleCancelLeave(l.id)}
                              className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: Payslips & Salary ─────────────────────────────────────────── */}
      {activeTab === 'payslips' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Days Present</th>
                  <th className="py-3 px-4">Gross Earnings</th>
                  <th className="py-3 px-4">Total Deductions</th>
                  <th className="py-3 px-4 font-bold">Net Salary</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payslipsData?.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No payslips available yet. Payslips will appear once payroll runs are published by Finance.
                    </td>
                  </tr>
                ) : (
                  payslipsData.data.map((ps: any) => (
                    <tr key={ps.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{ps.period}</td>
                      <td className="py-3 px-4 text-slate-600">{ps.days_present}</td>
                      <td className="py-3 px-4 text-slate-700">{money(ps.gross_inr)}</td>
                      <td className="py-3 px-4 text-rose-600">-{money(ps.total_deductions_inr)}</td>
                      <td className="py-3 px-4 font-bold text-emerald-700 text-sm">{money(ps.net_inr)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                          {ps.run_status || 'paid'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            downloadPayslipPdf({
                              ...ps,
                              shop_name: brand?.company_name || 'MarvelSoftware',
                              full_name: emp.full_name,
                              emp_code: emp.emp_code,
                              department_name: emp.department_name,
                              designation_name: emp.designation_name,
                              joining_date: emp.joining_date,
                              pan: emp.pan,
                              bank_account: emp.bank_account,
                              bank_ifsc: emp.bank_ifsc,
                              working_days: 30,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-colors"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: Work Reports & Charts ─────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Export & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Reporting Period:</span>
              <input
                type="month"
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const tasks = reportData?.data?.tasks || [];
                  downloadTasksCsv(tasks, `Work_Tasks_${emp.emp_code}_${reportPeriod}.csv`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const r = reportData?.data;
                  if (!r) return;
                  downloadEmployeeReportPdf({
                    companyName: brand?.company_name || 'MarvelSoftware',
                    employeeName: emp.full_name,
                    employeeCode: emp.emp_code,
                    departmentName: emp.department_name,
                    designationName: emp.designation_name,
                    periodLabel: reportPeriod,
                    totalHours: r.summary?.total_task_hours || 0,
                    totalTasks: r.summary?.total_tasks || 0,
                    clockedHours: r.summary?.clocked_hours || 0,
                    presentDays: r.summary?.present_days || 0,
                    leaveDays: r.summary?.leave_days || 0,
                    tagsSummary: r.tasks_by_tag || [],
                    tasks: r.tasks || [],
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 text-xs font-semibold transition-colors shadow-xs"
              >
                <FileDown className="w-4 h-4" />
                <span>Download PDF Report</span>
              </button>
            </div>
          </div>

          {/* KPI Statistics Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Task Hours</div>
              <div className="text-2xl font-bold text-slate-900">{reportData?.data?.summary?.total_task_hours || 0} hrs</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Tasks Completed</div>
              <div className="text-2xl font-bold text-slate-900">{reportData?.data?.summary?.total_tasks || 0}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Clocked Hours</div>
              <div className="text-2xl font-bold text-slate-900">{reportData?.data?.summary?.clocked_hours || 0} hrs</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Present Days</div>
              <div className="text-2xl font-bold text-emerald-600">{reportData?.data?.summary?.present_days || 0}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Leaves Taken</div>
              <div className="text-2xl font-bold text-amber-600">{reportData?.data?.summary?.leave_days || 0}</div>
            </div>
          </div>

          {/* Visual Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Hours Bar Chart */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Daily Hours Trend</h3>
                  <p className="text-xs text-slate-500">Tracked work hours across the period vs 8h target</p>
                </div>
              </div>
              <div className="h-64">
                {(reportData?.data?.daily_trend || []).length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No task hours logged in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.data.daily_trend}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="h" />
                      <RechartsTooltip />
                      <ReferenceLine y={8} stroke="#10B981" strokeDasharray="3 3" label={{ value: '8h Target', fill: '#10B981', fontSize: 10 }} />
                      <Bar dataKey="hours" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Tag Allocation Pie Chart */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Time by Category</h3>
                <p className="text-xs text-slate-500">Task distribution by tag</p>
              </div>
              <div className="h-48 flex items-center justify-center">
                {(reportData?.data?.tasks_by_tag || []).length === 0 ? (
                  <span className="text-xs text-slate-400">No tag data</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.data.tasks_by_tag}
                        dataKey="hours"
                        nameKey="tag"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {reportData.data.tasks_by_tag.map((entry: any) => (
                          <Cell key={entry.tag} fill={TAG_COLORS[entry.tag] || '#6B7280'} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {/* Category Legend */}
              <div className="space-y-1 max-h-36 overflow-y-auto text-xs">
                {(reportData?.data?.tasks_by_tag || []).map((t: any) => (
                  <div key={t.tag} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TAG_COLORS[t.tag] || '#6B7280' }} />
                      <span className="text-slate-700 font-medium">#{t.tag}</span>
                    </div>
                    <span className="text-slate-500 font-semibold">{t.hours}h ({t.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Log/Edit Completed Task ───────────────────────────────────── */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingTask ? 'Edit Completed Task' : 'Log Completed Task'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement invoice barcode scanning"
                  value={taskForm.task_title}
                  onChange={(e) => setTaskForm({ ...taskForm, task_title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Category Tag *</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DEFAULT_TAGS.map((tag) => {
                    const isSelected = taskForm.tag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTaskForm({ ...taskForm, tag })}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Hours Spent *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    required
                    value={taskForm.hours_spent}
                    onChange={(e) => setTaskForm({ ...taskForm, hours_spent: parseFloat(e.target.value) || 0.5 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Date Completed *</label>
                  <input
                    type="date"
                    required
                    value={taskForm.work_date}
                    onChange={(e) => setTaskForm({ ...taskForm, work_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Project / CRM Lead Reference (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Lead L00004 or Support Case SC00002"
                  value={taskForm.project_or_lead_ref}
                  onChange={(e) => setTaskForm({ ...taskForm, project_or_lead_ref: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Description of Work</label>
                <textarea
                  rows={3}
                  placeholder="Details of what was completed during these hours…"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors shadow-sm"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Apply for Leave ───────────────────────────────────────────── */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Apply for Leave</h3>
              <button
                type="button"
                onClick={() => setLeaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyLeave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Leave Type *</label>
                <select
                  required
                  value={leaveForm.leave_type_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                >
                  <option value="">Select leave type…</option>
                  {(leavesData?.data?.types || []).map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.paid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">From Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.from_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, from_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">To Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.to_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, to_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Reason for Leave</label>
                <textarea
                  rows={3}
                  placeholder="Specify reason for manager review…"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors shadow-sm"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
