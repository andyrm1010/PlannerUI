import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlannerCalendar } from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { ConfirmDialog } from "../../shared/dialog/ConfirmDialog";
import { useNotice } from "../../shared/notices/NoticeProvider";
import { useCalendarVisibility } from "../calendar/useCalendarVisibility";
import {
  CalendarDialog,
  normalizeCalendarMutationError,
} from "./CalendarDialog";

type CalendarsPageProps = {
  api: PlannerApi;
  userId: string;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; calendar: PlannerCalendar }
  | null;

export function CalendarsPage({ api, userId }: CalendarsPageProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotice();
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<PlannerCalendar | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const mountedRef = useRef(false);
  const userScopeRef = useRef(userId);
  const deleteTargetRef = useRef<PlannerCalendar | null>(null);
  const deleteInFlightRef = useRef(false);
  const deleteTokenRef = useRef(0);
  const calendarsQuery = useQuery({
    queryKey: ["calendars", userId],
    queryFn: () => api.getCalendars(userId),
  });
  const calendars = useMemo(
    () => calendarsQuery.data ?? [],
    [calendarsQuery.data],
  );
  const calendarIds = useMemo(
    () => calendars.map((calendar) => calendar.calendarId),
    [calendars],
  );
  const { visibleIds, toggle } = useCalendarVisibility(calendarIds);
  const deleteCalendar = useMutation({
    mutationFn: (calendarId: string) => api.deleteCalendar(calendarId),
  });

  useLayoutEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      deleteTokenRef.current += 1;
      deleteInFlightRef.current = false;
      deleteTargetRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (userScopeRef.current === userId) {
      return;
    }

    userScopeRef.current = userId;
    deleteTokenRef.current += 1;
    deleteInFlightRef.current = false;
    deleteTargetRef.current = null;
    setDeletePending(false);
    setEditorState(null);
    setDeleteTarget(null);
  }, [userId]);

  const deleteOperationIsCurrent = (
    operationToken: number,
    operationUserId: string,
    calendarId?: string,
  ) =>
    mountedRef.current &&
    operationToken === deleteTokenRef.current &&
    userScopeRef.current === operationUserId &&
    (calendarId === undefined ||
      deleteTargetRef.current?.calendarId === calendarId);

  const requestDelete = (calendar: PlannerCalendar) => {
    deleteTargetRef.current = calendar;
    setDeleteTarget(calendar);
  };

  const closeDelete = () => {
    if (deleteInFlightRef.current) {
      return;
    }
    deleteTokenRef.current += 1;
    deleteTargetRef.current = null;
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    const target = deleteTargetRef.current;
    if (!target || deleteInFlightRef.current) {
      return;
    }

    deleteInFlightRef.current = true;
    setDeletePending(true);
    const operationToken = ++deleteTokenRef.current;
    const operationUserId = userId;
    try {
      await deleteCalendar.mutateAsync(target.calendarId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["calendars", operationUserId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["events", operationUserId],
        }),
      ]);
      if (
        !deleteOperationIsCurrent(
          operationToken,
          operationUserId,
          target.calendarId,
        )
      ) {
        return;
      }
      notify("Calendar deleted.", "success");
      deleteTargetRef.current = null;
      setDeleteTarget(null);
    } catch (error) {
      if (
        deleteOperationIsCurrent(
          operationToken,
          operationUserId,
          target.calendarId,
        )
      ) {
        notify(normalizeCalendarMutationError(error), "error");
      }
    } finally {
      if (deleteOperationIsCurrent(operationToken, operationUserId)) {
        deleteInFlightRef.current = false;
        setDeletePending(false);
      }
    }
  };

  return (
    <section className="route-page route-page--calendars">
      <h1>Calendars</h1>
      <button
        className="button--primary calendars-page__create"
        disabled={deletePending}
        onClick={() => setEditorState({ mode: "create" })}
        type="button"
      >
        Create calendar
      </button>

      {calendarsQuery.isLoading ? (
        <p aria-live="polite" role="status">
          Loading calendars
        </p>
      ) : null}

      {calendarsQuery.isError ? (
        <div>
          <p role="alert">Unable to load calendars.</p>
          <button
            onClick={() => void calendarsQuery.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      {calendarsQuery.isSuccess && calendars.length === 0 ? (
        <p>No calendars yet.</p>
      ) : null}

      {calendars.length > 0 ? (
        <ul aria-label="Calendars" className="calendar-list">
          {calendars.map((calendar) => {
            const colorHex =
              calendar.colorHex?.toUpperCase() ?? "#6C63E8";

            return (
              <li key={calendar.calendarId}>
                <article aria-label={calendar.name} className="calendar-card">
                  <label>
                    <input
                      checked={visibleIds.has(calendar.calendarId)}
                      onChange={() => toggle(calendar.calendarId)}
                      type="checkbox"
                    />
                    Show {calendar.name} calendar
                  </label>
                  <h2>{calendar.name}</h2>
                  <p>{calendar.description ?? "No description."}</p>
                  <p>
                    <span
                      aria-hidden="true"
                      className="calendar-card__color"
                      data-color={colorHex}
                      data-testid="calendar-color-swatch"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span>Color {colorHex}</span>
                  </p>
                  <button
                    aria-label={`Edit ${calendar.name}`}
                    disabled={deletePending}
                    onClick={() =>
                      setEditorState({ mode: "edit", calendar })
                    }
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${calendar.name}`}
                    className="button--danger calendar-card__delete"
                    disabled={deletePending}
                    onClick={() => requestDelete(calendar)}
                    type="button"
                  >
                    Delete
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editorState ? (
        editorState.mode === "create" ? (
          <CalendarDialog
            open
            mode="create"
            api={api}
            userId={userId}
            onClose={() => setEditorState(null)}
          />
        ) : (
          <CalendarDialog
            open
            mode="edit"
            api={api}
            userId={userId}
            calendar={editorState.calendar}
            onClose={() => setEditorState(null)}
          />
        )
      ) : null}

      <ConfirmDialog
        destructive
        confirmLabel="Delete"
        open={Boolean(deleteTarget)}
        pending={deletePending}
        title="Delete calendar?"
        onClose={closeDelete}
        onConfirm={() => void handleDelete()}
      >
        {deleteTarget
          ? `${deleteTarget.name} and its events will be permanently deleted.`
          : "This calendar will be permanently deleted."}
      </ConfirmDialog>
    </section>
  );
}
