/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Authentication / Sign-in Screen (Login.tsx)
 * ==============================================================================
 * Layout Architecture:
 * - Desktop: Split-pane design (5:7 ratio on md+, 1:1 on lg+).
 *   - Left: Deep enterprise brand showcase (#0B0F19) with subtle radial glows,
 *     logo badge, product title, and architectural feature badges.
 *   - Right: Centered, clean form card with accessible inputs, interactive
 *     password reveal, and 1-click demo role population for instant testing.
 * - Mobile: Stacks gracefully into a compact brand header followed by the form.
 *
 * Design Tokens:
 * - Brand Dark: #0B0F19 (Deep Obsidian Navy)
 * - Accent Blue: #2563EB (brand-600)
 * - Surface: #F8FAFC (slate-50 page background), #FFFFFF (form surface)
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/auth';
import { useBranding } from '../hooks/branding';
import {
  ShieldCheck,
  Users,
  Briefcase,
  Layers,
  CheckCircle2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

/** Pre-configured demo accounts for fast evaluative testing */
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@marvelsoftware.local', pass: 'Admin@123', badge: 'Full access' },
  { role: 'HR', email: 'hr@marvelsoftware.local', pass: 'Hr@12345', badge: 'People & Leave' },
  { role: 'Finance', email: 'finance@marvelsoftware.local', pass: 'Finance@123', badge: 'Books & Payroll' },
  { role: 'Employee', email: 'employee@marvelsoftware.local', pass: 'Employee@123', badge: 'Self-service' },
];

export default function Login() {
  const { login } = useAuth();
  const { brand } = useBranding();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@marvelsoftware.local');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Runtime branding resolved from server (/api/config)
  const productName = brand.product_name || brand.company_name || 'MarvelSoftware';
  const companyName = brand.company_name || 'MarvelSoftware Inc.';

  /* ── 1. Form Submission Handler ─────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  /* ── 2. Demo Account Helper ─────────────────────────────────────────────── */
  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans">
      {/* ──────────────────────────────────────────────────────────────────
          LEFT PANE: Brand Identity & Feature Value Proposition
          ────────────────────────────────────────────────────────────────── */}
      <div className="relative md:w-5/12 lg:w-1/2 bg-[#0B0F19] text-white p-8 md:p-14 flex flex-col justify-between overflow-hidden">
        {/* Ambient atmospheric glows */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-brand-600/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />

        {/* Brand Header & Value Stack */}
        <div className="relative z-10">
          {/* Logo & Product Monogram */}
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-11 h-11 rounded-xl bg-white p-1.5 shadow-lg shadow-black/20 flex items-center justify-center">
              <img src="/logo.avif" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight block text-white">{productName}</span>
              <span className="text-xs text-slate-400 font-medium tracking-wider uppercase">Enterprise Suite</span>
            </div>
          </div>

          {/* Headline & Value Narrative */}
          <div className="space-y-4 max-w-lg mt-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Integrated Business Platform</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              One central cockpit for people, money, and operations.
            </h1>
            <p className="text-slate-400 text-sm lg:text-base leading-relaxed">
              Consolidated administration for staff, biometric attendance, monthly payroll, and organizational operations.
            </p>
          </div>

          {/* Core Capability Highlights */}
          <div className="mt-10 grid gap-4 max-w-md">
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Role-Based Access Control</h4>
                <p className="text-xs text-slate-400">Tailored permissions and access boundaries for every team member.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Staff, Shifts &amp; Attendance</h4>
                <p className="text-xs text-slate-400">Biometric punch capture, shift tracking, and leave approvals.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Full Event Auditing</h4>
                <p className="text-xs text-slate-400">Automated event logging for governance, security, and compliance.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Footer: Company Info & Connectivity Status */}
        <div className="relative z-10 pt-8 mt-12 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>{companyName}</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> System Online
          </span>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          RIGHT PANE: Interactive Sign-in Form
          ────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-7">
          {/* Header */}
          <div>
            <span className="text-xs font-bold tracking-wider uppercase text-brand-600 block mb-1">
              Authentication Portal
            </span>
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Sign in with your organization email and assigned credentials.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5 animate-in fade-in">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Work Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                icon={<Mail className="w-4 h-4" />}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  icon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full text-sm font-semibold tracking-wide shadow-sm mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying Session…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in to Workspace <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          {/* 1-Click Demo Accounts Selector */}
          <div className="pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500">Quick sign-in with demo roles:</span>
              <span className="text-[11px] font-semibold text-brand-600">Click to fill</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  onClick={() => fillDemo(d.email, d.pass)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                    email === d.email
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="font-semibold text-slate-800">{d.role}</div>
                  <div className="text-[10px] text-slate-500 truncate">{d.badge}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
