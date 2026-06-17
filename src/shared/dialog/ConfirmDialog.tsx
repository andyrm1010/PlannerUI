import { useId, type ReactNode } from "react";
import { Dialog } from "./Dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  cancelLabel?: string;
  cancel?: string;
  destructive?: boolean;
  pending?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  cancelLabel,
  cancel,
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  const descriptionId = useId();

  return (
    <Dialog
      ariaDescribedBy={descriptionId}
      className="confirm-dialog"
      open={open}
      title={title}
      onClose={onClose}
      preventClose={pending}
      role="alertdialog"
    >
      <p id={descriptionId}>{children}</p>
      <div className="confirm-dialog__actions">
        <button disabled={pending} onClick={onClose} type="button">
          {cancelLabel ?? cancel ?? "Cancel"}
        </button>
        <button
          className={destructive ? "button--danger" : undefined}
          data-tone={destructive ? "destructive" : undefined}
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
