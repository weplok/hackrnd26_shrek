import { useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

type ClassValue = string | false | null | undefined;

function classes(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, type = 'button', variant = 'secondary', ...props }: ButtonProps): ReactNode {
  return <button {...props} className={classes('zd-button', `zd-button--${variant}`, className)} type={type} />;
}

export type PanelTone = 'default' | 'danger';

export type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  title?: ReactNode;
  tone?: PanelTone;
};

export function Panel({ children, className, title, tone = 'default', ...props }: PanelProps): ReactNode {
  const titleId = useId();

  return (
    <section
      {...props}
      aria-labelledby={title ? titleId : props['aria-labelledby']}
      className={classes('zd-panel', `zd-panel--${tone}`, className)}
    >
      {title ? (
        <header className="zd-panel__header">
          <PanelLights />
          <span id={titleId}>{title}</span>
        </header>
      ) : null}
      <div className="zd-panel__body">{children}</div>
    </section>
  );
}

export type SheetProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  title: ReactNode;
};

export function Sheet({ children, className, title, ...props }: SheetProps): ReactNode {
  const titleId = useId();

  return (
    <aside {...props} aria-labelledby={titleId} className={classes('zd-sheet', className)}>
      <header className="zd-sheet__header">
        <span id={titleId}>{title}</span>
      </header>
      <div className="zd-sheet__body">{children}</div>
    </aside>
  );
}

export type ModalProps = {
  children: ReactNode;
  closeLabel: string;
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
};

export function Modal({ children, closeLabel, isOpen, onClose, title }: ModalProps): ReactNode {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <dialog aria-labelledby={titleId} className="zd-modal-backdrop" open>
      <section className="zd-modal">
        <header className="zd-modal__header">
          <span id={titleId}>{title}</span>
          <Button aria-label={closeLabel} className="zd-modal__close" onClick={onClose} variant="ghost">
            ×
          </Button>
        </header>
        <div className="zd-modal__body">{children}</div>
      </section>
    </dialog>
  );
}

export type MeterStatus = 'calm' | 'warning' | 'danger' | 'secure';

export type MeterProps = {
  label: ReactNode;
  max?: number;
  min?: number;
  status?: MeterStatus;
  value: number;
  valueText?: string;
};

export function Meter({ label, max = 100, min = 0, status = 'calm', value, valueText }: MeterProps): ReactNode {
  const boundedValue = Math.min(Math.max(value, min), max);
  const range = max - min;
  const percentage = range === 0 ? 0 : ((boundedValue - min) / range) * 100;

  return (
    <div className="zd-meter">
      <div className="zd-meter__label">
        <span>{label}</span>
        {valueText ? <strong>{valueText}</strong> : null}
      </div>
      <div
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={boundedValue}
        aria-valuetext={valueText}
        className="zd-meter__track"
        role="progressbar"
      >
        <span
          className={classes('zd-meter__fill', `zd-meter__fill--${status}`)}
          style={{ width: `${String(percentage)}%` }}
        />
      </div>
    </div>
  );
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export type ToastProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  title?: ReactNode;
  variant?: ToastVariant;
};

export function Toast({ children, className, title, variant = 'info', ...props }: ToastProps): ReactNode {
  return (
    <div
      {...props}
      className={classes('zd-toast', `zd-toast--${variant}`, className)}
      role={variant === 'danger' ? 'alert' : 'status'}
    >
      {title ? <strong className="zd-toast__title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
};

export function Tooltip({ children, content }: TooltipProps): ReactNode {
  const descriptionId = useId();

  return (
    <button aria-describedby={descriptionId} className="zd-tooltip" type="button">
      {children}
      <span className="zd-tooltip__content" id={descriptionId} role="tooltip">
        {content}
      </span>
    </button>
  );
}

function PanelLights(): ReactNode {
  return (
    <span aria-hidden="true" className="zd-panel__lights">
      <i className="zd-panel__light zd-panel__light--magenta" />
      <i className="zd-panel__light zd-panel__light--amber" />
      <i className="zd-panel__light zd-panel__light--green" />
    </span>
  );
}
