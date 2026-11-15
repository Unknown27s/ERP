import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 select-none rounded-lg';
    
    const variants = {
      default: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:text-slate-100',
      outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
      destructive: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
      link: 'text-brand-600 underline-offset-4 hover:underline p-0 h-auto',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-11 px-6 text-base gap-2.5',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
