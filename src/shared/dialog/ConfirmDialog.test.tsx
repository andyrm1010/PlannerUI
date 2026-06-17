import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("closes on cancel and can be reopened for destructive confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Reopen confirmation
          </button>
          <ConfirmDialog
            destructive
            open={open}
            title="Delete event?"
            confirmLabel="Delete"
            onClose={() => setOpen(false)}
            onConfirm={onConfirm}
          >
            This cannot be undone.
          </ConfirmDialog>
        </>
      );
    }

    render(<Harness />);

    expect(
      screen.getByRole("alertdialog", { name: "Delete event?" }),
    ).toBeVisible();
    expect(
      screen.getByRole("alertdialog", { name: "Delete event?" }),
    ).toHaveAccessibleDescription("This cannot be undone.");
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toHaveAttribute("data-tone", "destructive");
    expect(confirm).toHaveClass("button--danger");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("alertdialog", { name: "Delete event?" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Reopen confirmation" }),
    );
    const reopenedConfirm = screen.getByRole("button", { name: "Delete" });
    await user.click(reopenedConfirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables actions while pending", () => {
    render(
      <ConfirmDialog
        open
        pending
        title="Delete event?"
        confirmLabel="Delete"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      >
        This cannot be undone.
      </ConfirmDialog>,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });
});
