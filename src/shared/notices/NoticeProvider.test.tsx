import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeProvider, useNotice } from "./NoticeProvider";

function NoticeControls() {
  const { notify } = useNotice();

  return (
    <>
      <button type="button" onClick={() => notify("First notice")}>
        Notify first
      </button>
      <button
        type="button"
        onClick={() => notify("Second notice", "success")}
      >
        Notify second
      </button>
      <button
        type="button"
        onClick={() => notify("Save failed", "error")}
      >
        Notify error
      </button>
    </>
  );
}

describe("NoticeProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(123);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders notices in a polite live region and removes each after five seconds", () => {
    render(
      <NoticeProvider>
        <NoticeControls />
      </NoticeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify first" }));

    const liveRegion = screen.getByRole("region", { name: "Notifications" });
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("First notice")).toHaveAttribute(
      "data-tone",
      "info",
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Notify second" }));

    expect(screen.getByText("Second notice")).toHaveAttribute(
      "data-tone",
      "success",
    );

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(screen.queryByText("First notice")).not.toBeInTheDocument();
    expect(screen.getByText("Second notice")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.queryByText("Second notice")).not.toBeInTheDocument();
  });

  it("clears pending notice timers when the provider unmounts", () => {
    const view = render(
      <NoticeProvider>
        <NoticeControls />
      </NoticeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify first" }));
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("announces errors assertively without placing them in the polite region", () => {
    render(
      <NoticeProvider>
        <NoticeControls />
      </NoticeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify first" }));
    fireEvent.click(screen.getByRole("button", { name: "Notify error" }));

    const politeRegion = screen.getByRole("region", {
      name: "Notifications",
    });
    const error = screen.getByRole("alert");
    expect(politeRegion).toContainElement(screen.getByText("First notice"));
    expect(politeRegion).not.toContainElement(error);
    expect(error).toHaveTextContent("Save failed");
    expect(error).toHaveAttribute("aria-live", "assertive");
  });
});
