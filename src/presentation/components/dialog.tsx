'use client';
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
export function DialogBack({ onBack }: { onBack: () => void }) {
  return (
    <div className="dialog-navigation">
      <button type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" /> Volver
      </button>
    </div>
  );
}
let activeDialogs = 0;
let originalOverflow = '';
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    if (activeDialogs === 0) originalOverflow = document.body.style.overflow;
    activeDialogs += 1;
    document.body.style.overflow = 'hidden';
    el.focus();
    const key = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ),
        ).filter((x) => x.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === el)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      activeDialogs -= 1;
      if (activeDialogs === 0) document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
export function FormDialog({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useDialog(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogBack onBack={onClose} />
        {children}
      </section>
    </div>
  );
}
