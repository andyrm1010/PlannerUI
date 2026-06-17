import { fireEvent, screen } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerCalendar, PlannerEvent } from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { NoticeProvider } from "../../shared/notices/NoticeProvider";

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("./eventMutations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./eventMutations")>();
  return {
    ...actual,
    useCreateEvent: () => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }),
    useUpdateEvent: () => ({
      isPending: false,
      mutateAsync: mutationMocks.update,
    }),
    useDeleteEvent: () => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }),
  };
});

import { EventDialog } from "./EventDialog";

const calendar: PlannerCalendar = {
  calendarId: "work",
  ownerUserId: "user-1",
  name: "Work",
  description: null,
  colorHex: "#3366ff",
};

const event: PlannerEvent = {
  eventId: "event-1",
  calendarId: "work",
  createdByUserId: "user-1",
  title: "First event",
  description: null,
  startUtc: new Date("2026-06-12T09:00").toISOString(),
  endUtc: new Date("2026-06-12T10:00").toISOString(),
  isAllDay: false,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  mutationMocks.update.mockReset();
});

describe("EventDialog committed identity", () => {
  it("cannot close event 2 when event 1 resolves in the event-2 commit", async () => {
    const pendingUpdate = deferred<void>();
    mutationMocks.update.mockReturnValue(pendingUpdate.promise);
    const onClose = vi.fn();
    const secondEvent = {
      ...event,
      eventId: "event-2",
      title: "Second event",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveSecondCommit!: () => void;
    const secondCommit = new Promise<void>((resolve) => {
      resolveSecondCommit = resolve;
    });

    function Editor({ currentEvent }: { currentEvent: PlannerEvent }) {
      return (
        <>
          <span
            ref={(node) => {
              if (node && currentEvent.eventId === "event-2") {
                resolveSecondCommit();
                pendingUpdate.resolve();
              }
            }}
          />
          <EventDialog
            open
            mode="edit"
            api={{} as PlannerApi}
            userId="user-1"
            calendars={[calendar]}
            event={currentEvent}
            onClose={onClose}
          />
        </>
      );
    }

    flushSync(() => {
      root.render(
        <NoticeProvider>
          <Editor currentEvent={event} />
        </NoticeProvider>,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mutationMocks.update).toHaveBeenCalledOnce();

    root.render(
      <NoticeProvider>
        <Editor currentEvent={secondEvent} />
      </NoticeProvider>,
    );
    await secondCommit;
    await Promise.resolve();
    await Promise.resolve();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Second event",
    );

    flushSync(() => root.unmount());
    container.remove();
  });
});
