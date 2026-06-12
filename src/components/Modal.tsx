import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={`${wide ? 'w-[44rem]' : 'w-[28rem]'} max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100" aria-label="close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
