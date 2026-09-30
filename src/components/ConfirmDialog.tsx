import { useEffect, useRef } from 'react';

export type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void };

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) dialog.showModal();
    if (!state && dialog.open) dialog.close();
  }, [state]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      {state && (
        <form method="dialog" onSubmit={(e) => e.preventDefault()}>
          <h2 id="dialog-title">{state.title}</h2>
          <p>{state.message}</p>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={onClose} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                state.onConfirm();
                onClose();
              }}
            >
              {state.confirmLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
