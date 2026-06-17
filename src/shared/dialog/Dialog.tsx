import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  preventClose?: boolean;
  focusKey?: string | number;
  ariaDescribedBy?: string;
};

const formControlSelector = [
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
].join(",");

export function Dialog({
  open,
  title,
  onClose,
  children,
  className,
  role = "dialog",
  preventClose = false,
  focusKey,
  ariaDescribedBy,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastFocusKeyRef = useRef<string | number | undefined>(undefined);
  const titleId = useId();

  const restoreFocus = () => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) {
      target.focus();
    }
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      const opening = !wasOpenRef.current;
      const focusKeyChanged =
        !opening && lastFocusKeyRef.current !== focusKey;
      if (opening) {
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      wasOpenRef.current = true;

      if (!dialog.open) {
        dialog.showModal();
      }

      if (opening || focusKeyChanged) {
        dialog
          .querySelector<HTMLElement>(
            `[data-dialog-content] ${formControlSelector}`,
          )
          ?.focus();
      }
      lastFocusKeyRef.current = focusKey;
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      lastFocusKeyRef.current = undefined;
      restoreFocus();
    }
  }, [focusKey, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        restoreFocus();
      }
    };
  }, []);

  return (
    <dialog
      aria-describedby={ariaDescribedBy}
      aria-labelledby={titleId}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        if (!preventClose) {
          onClose();
        }
      }}
      ref={dialogRef}
      role={role}
    >
      <div className="dialog__header">
        <h2 id={titleId}>{title}</h2>
      </div>
      <div data-dialog-content>{children}</div>
      <button
        aria-label="Close"
        disabled={preventClose}
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </dialog>
  );
}
