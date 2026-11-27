import { useId, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: ModalSize;
  zIndex?: number;
  /** Set false to require an explicit action (no overlay/escape close). */
  dismissible?: boolean;
  /** Prevent closing while a server operation is pending. */
  pending?: boolean;
  /** Ask before discarding an edited form. */
  dirty?: boolean;
  bodyClassName?: string;
  className?: string;
}

const MAX_WIDTH: Record<ModalSize, string> = {
  sm: '440px',
  md: '620px',
  lg: '820px',
  xl: '1040px',
  full: 'min(1360px, calc(100vw - 32px))',
};

/**
 * Shared popup shell used by every add/edit/detail flow.
 *
 * Rendered through a portal so a modal can be opened from inside a card
 * without being clipped by overflow, and so nested modals (e.g. a product
 * detail opened from a sales drill-down) stack correctly.
 */
export default function Modal({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  size = 'lg',
  zIndex = 1000,
  dismissible = true,
  pending = false,
  dirty = false,
  bodyClassName,
  className = '',
}: ModalProps) {
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const descriptionId = useId();
  const close = () => {
    if (pending) return;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" style={{ zIndex }}>
      <Dialog.Content
        className={`modal ${className}`.trim()}
        style={{ maxWidth: MAX_WIDTH[size] }}
        aria-describedby={subtitle ? descriptionId : undefined}
        onEscapeKeyDown={(event) => { if (!dismissible || pending) event.preventDefault(); }}
        onInteractOutside={(event) => { if (!dismissible || pending) event.preventDefault(); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
      >
        {(title || subtitle) && (
          <div className="modal-head">
            <div className="modal-head-copy">
              <div className="modal-title-row">
                {icon && <span className="modal-icon">{icon}</span>}
                <Dialog.Title className={title ? 'modal-title' : 'sr-only'}>{title || 'Dialog'}</Dialog.Title>
              </div>
              {subtitle && <Dialog.Description id={descriptionId} className="modal-sub" asChild><div>{subtitle}</div></Dialog.Description>}
            </div>
            <button type="button" className="modal-close" disabled={pending} onClick={close} aria-label="Close dialog" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        {!title && !subtitle && <Dialog.Title className="sr-only">Dialog</Dialog.Title>}

        <div className={`modal-body ${bodyClassName || ''}`.trim()}>{children}</div>

        {footer && <div className="modal-foot">{footer}</div>}
      </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Small labelled search field + explicit Search button used by list/filter popups. */
export function ModalSearch({
  value,
  onChange,
  onSearch,
  placeholder,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="modal-search">
      <div className="modal-search-input">
        <Search className="w-4 h-4" />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearch();
            }
          }}
          placeholder={placeholder || 'Search…'}
        />
      </div>
      <button type="button" className="btn primary" onClick={onSearch}>
        <Search className="w-4 h-4" />
        Search
      </button>
    </div>
  );
}
