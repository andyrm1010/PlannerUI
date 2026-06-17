import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PlannerCalendar,
  PlannerEvent,
} from "../../api/contracts";
import type { PlannerApi } from "../../api/plannerApi";
import { ConfirmDialog } from "../../shared/dialog/ConfirmDialog";
import { Dialog } from "../../shared/dialog/Dialog";
import { useNotice } from "../../shared/notices/NoticeProvider";
import {
  toLocalDateTimeInput,
  utcAllDayToDates,
} from "../calendar/dateMapping";
import {
  EventForm,
  type EventFormSubmission,
  type EventFormValues,
} from "./EventForm";
import {
  normalizeEventMutationError,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from "./eventMutations";

export type EventSelection = {
  startUtc: string;
  endUtc: string;
  allDay: boolean;
};

type CommonEventDialogProps = {
  open: boolean;
  api: PlannerApi;
  userId: string;
  calendars: PlannerCalendar[];
  onClose: () => void;
};

type EventDialogProps =
  | (CommonEventDialogProps & {
      mode: "create";
      selection?: EventSelection;
      event?: never;
    })
  | (CommonEventDialogProps & {
      mode: "edit";
      event: PlannerEvent;
      selection?: never;
    });

function defaultTimedSelection(): EventSelection {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    allDay: false,
  };
}

function valuesFromSelection(
  selection: EventSelection,
  calendarId: string,
): EventFormValues {
  if (selection.allDay) {
    const dates = utcAllDayToDates(selection.startUtc, selection.endUtc);
    return {
      title: "",
      description: "",
      calendarId,
      isAllDay: true,
      ...dates,
      startDateTime: "",
      endDateTime: "",
    };
  }

  const startDateTime = toLocalDateTimeInput(selection.startUtc);
  const endDateTime = toLocalDateTimeInput(selection.endUtc);
  return {
    title: "",
    description: "",
    calendarId,
    isAllDay: false,
    startDate: startDateTime.slice(0, 10),
    endDate: endDateTime.slice(0, 10),
    startDateTime,
    endDateTime,
  };
}

function valuesFromEvent(event: PlannerEvent): EventFormValues {
  if (event.isAllDay) {
    const dates = utcAllDayToDates(event.startUtc, event.endUtc);
    return {
      title: event.title,
      description: event.description ?? "",
      calendarId: event.calendarId,
      isAllDay: true,
      ...dates,
      startDateTime: "",
      endDateTime: "",
    };
  }

  const startDateTime = toLocalDateTimeInput(event.startUtc);
  const endDateTime = toLocalDateTimeInput(event.endUtc);
  return {
    title: event.title,
    description: event.description ?? "",
    calendarId: event.calendarId,
    isAllDay: false,
    startDate: startDateTime.slice(0, 10),
    endDate: endDateTime.slice(0, 10),
    startDateTime,
    endDateTime,
  };
}

export function EventDialog(props: EventDialogProps) {
  const { notify } = useNotice();
  const [confirmDeleteIdentity, setConfirmDeleteIdentity] = useState<
    string | null
  >(null);
  const createEvent = useCreateEvent(props.api, props.userId);
  const updateEvent = useUpdateEvent(props.api, props.userId);
  const deleteEvent = useDeleteEvent(props.api, props.userId);
  const editorIdentity =
    props.mode === "edit"
      ? `edit:${props.event.eventId}`
      : `create:${props.selection?.startUtc ?? "default"}:${props.selection?.endUtc ?? ""}:${props.selection?.allDay ?? false}`;
  const lifecycleKey = `${props.open}:${editorIdentity}`;
  const lifecycleRef = useRef(lifecycleKey);
  const operationTokenRef = useRef(0);
  const initialValues = useMemo(
    () =>
      props.mode === "edit"
        ? valuesFromEvent(props.event)
        : valuesFromSelection(
            props.selection ?? defaultTimedSelection(),
            props.calendars[0]?.calendarId ?? "",
          ),
    [props],
  );
  const busy =
    createEvent.isPending ||
    updateEvent.isPending ||
    deleteEvent.isPending;

  useLayoutEffect(() => {
    if (lifecycleRef.current !== lifecycleKey) {
      lifecycleRef.current = lifecycleKey;
      operationTokenRef.current += 1;
      setConfirmDeleteIdentity(null);
    }
    if (!props.open) {
      setConfirmDeleteIdentity(null);
    }
  }, [lifecycleKey, props.open]);

  const operationIsCurrent = (token: number) =>
    token === operationTokenRef.current &&
    lifecycleRef.current === `true:${editorIdentity}`;

  const handleSubmit = async (submission: EventFormSubmission) => {
    const operationToken = ++operationTokenRef.current;
    try {
      if (submission.mode === "create") {
        await createEvent.mutateAsync(submission.input);
        if (!operationIsCurrent(operationToken)) {
          return;
        }
        notify("Event created.", "success");
      } else if (props.mode === "edit") {
        await updateEvent.mutateAsync({
          eventId: props.event.eventId,
          input: submission.input,
        });
        if (!operationIsCurrent(operationToken)) {
          return;
        }
        notify("Event updated.", "success");
      }
      props.onClose();
    } catch (error) {
      if (operationIsCurrent(operationToken)) {
        notify(normalizeEventMutationError(error), "error");
      }
    }
  };

  const handleDelete = async () => {
    if (
      props.mode !== "edit" ||
      confirmDeleteIdentity !== editorIdentity
    ) {
      return;
    }
    const operationToken = ++operationTokenRef.current;
    try {
      await deleteEvent.mutateAsync(props.event.eventId);
      if (!operationIsCurrent(operationToken)) {
        return;
      }
      notify("Event deleted.", "success");
      setConfirmDeleteIdentity(null);
      props.onClose();
    } catch (error) {
      if (operationIsCurrent(operationToken)) {
        notify(normalizeEventMutationError(error), "error");
      }
    }
  };

  return (
    <>
      <Dialog
        className="event-dialog"
        open={props.open}
        title={props.mode === "create" ? "Create event" : "Edit event"}
        onClose={props.onClose}
        preventClose={busy}
        focusKey={editorIdentity}
      >
        {props.mode === "create" ? (
          <EventForm
            key={`${props.selection?.startUtc ?? "default"}-${props.selection?.endUtc ?? ""}`}
            mode="create"
            createdByUserId={props.userId}
            calendars={props.calendars}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            pending={busy}
            resetKey={`${editorIdentity}:${props.open}`}
          />
        ) : (
          <EventForm
            key={props.event.eventId}
            mode="edit"
            calendars={props.calendars}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            pending={busy}
            resetKey={`${editorIdentity}:${props.open}`}
          />
        )}
        {props.mode === "edit" ? (
          <button
            className="button--danger event-dialog__delete"
            disabled={busy}
            onClick={() => setConfirmDeleteIdentity(editorIdentity)}
            type="button"
          >
            Delete event
          </button>
        ) : null}
      </Dialog>

      {props.mode === "edit" ? (
        <ConfirmDialog
          destructive
          open={
            props.open && confirmDeleteIdentity === editorIdentity
          }
          pending={busy}
          title="Delete event?"
          confirmLabel="Delete"
          onClose={() => setConfirmDeleteIdentity(null)}
          onConfirm={() => void handleDelete()}
        >
          This event will be permanently deleted.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
