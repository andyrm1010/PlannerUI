import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Dialog", () => {
  it("opens modally, labels itself, and focuses the first form control", () => {
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, "showModal")
      .mockImplementation(function showModal(this: HTMLDialogElement) {
        this.open = true;
      });

    const view = render(
      <Dialog open title="Edit event" onClose={vi.fn()}>
        <label>
          Title
          <input />
        </label>
      </Dialog>,
    );

    expect(showModal).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("dialog", { name: "Edit event" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();

    view.rerender(
      <Dialog open title="Edit event" onClose={vi.fn()}>
        <label>
          Title
          <input />
        </label>
      </Dialog>,
    );
    expect(showModal).toHaveBeenCalledOnce();
  });

  it("refocuses for a new focus key without stealing focus on ordinary rerenders", () => {
    const view = render(
      <Dialog open focusKey="event-1" title="Edit event" onClose={vi.fn()}>
        <input aria-label="Title" />
        <button type="button">Secondary action</button>
      </Dialog>,
    );
    const title = screen.getByRole("textbox", { name: "Title" });
    const secondary = screen.getByRole("button", {
      name: "Secondary action",
    });

    expect(title).toHaveFocus();
    secondary.focus();
    view.rerender(
      <Dialog open focusKey="event-1" title="Edit event" onClose={vi.fn()}>
        <input aria-label="Title" />
        <button type="button">Secondary action</button>
      </Dialog>,
    );
    expect(secondary).toHaveFocus();

    view.rerender(
      <Dialog open focusKey="event-2" title="Edit event" onClose={vi.fn()}>
        <input aria-label="Title" />
        <button type="button">Secondary action</button>
      </Dialog>,
    );
    expect(title).toHaveFocus();
  });

  it("requests close from the button and native cancel event", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Dialog open title="Edit event" onClose={onClose}>
        <input aria-label="Title" />
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();

    const cancelEvent = new Event("cancel", { cancelable: true });
    screen
      .getByRole("dialog", { name: "Edit event" })
      .dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not show or close a dialog that is already in the requested state", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");

    render(
      <Dialog open={false} title="Edit event" onClose={vi.fn()}>
        <input aria-label="Title" />
      </Dialog>,
    );

    expect(showModal).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("locks user close actions while still allowing controlled closure", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    const view = render(
      <Dialog open preventClose title="Saving event" onClose={onClose}>
        <input aria-label="Title" />
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Saving event" });

    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(
      <Dialog open={false} preventClose title="Saving event" onClose={onClose}>
        <input aria-label="Title" />
      </Dialog>,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the native dialog and restores trigger focus on close or unmount", async () => {
    const user = userEvent.setup();
    const close = vi
      .spyOn(HTMLDialogElement.prototype, "close")
      .mockImplementation(function close(this: HTMLDialogElement) {
        this.open = false;
      });

    function Harness() {
      const [open, setOpen] = useState(false);
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Open editor
          </button>
          {mounted ? (
            <Dialog
              open={open}
              title="Edit event"
              onClose={() => setOpen(false)}
            >
              <input aria-label="Title" />
            </Dialog>
          ) : null}
          <button onClick={() => setMounted(false)} type="button">
            Unmount editor
          </button>
        </>
      );
    }

    const view = render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Open editor" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Open editor" }));
    await user.click(screen.getByRole("button", { name: "Unmount editor" }));
    expect(screen.getByRole("button", { name: "Open editor" })).toHaveFocus();
    view.unmount();
  });
});
