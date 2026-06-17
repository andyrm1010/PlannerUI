import {
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import type {
  CreateEventInput,
  PlannerCalendar,
  UpdateEventInput,
} from "../../api/contracts";
import {
  allDayDatesToUtc,
  localDateTimeToUtc,
} from "../calendar/dateMapping";

export type EventFormValues = {
  title: string;
  description: string;
  calendarId: string;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
};

export type EventFormErrors = Partial<
  Record<keyof EventFormValues, string>
>;

export type EventFormSubmission =
  | { mode: "create"; input: CreateEventInput }
  | { mode: "edit"; input: UpdateEventInput };

type CommonEventFormProps = {
  initialValues: EventFormValues;
  calendars: PlannerCalendar[];
  onSubmit: (submission: EventFormSubmission) => void | Promise<void>;
  pending?: boolean;
  resetKey?: string | number;
};

type EventFormProps =
  | (CommonEventFormProps & {
      mode: "create";
      createdByUserId: string;
    })
  | (CommonEventFormProps & {
      mode: "edit";
      createdByUserId?: never;
    });

function validate(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};
  const title = values.title.trim();

  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > 300) {
    errors.title = "Title must be 300 characters or fewer.";
  }
  if (!values.calendarId) {
    errors.calendarId = "Calendar is required.";
  }

  if (values.isAllDay) {
    if (!values.startDate || !values.endDate) {
      errors.endDate = "Enter valid start and end dates.";
    } else if (values.endDate < values.startDate) {
      errors.endDate = "End date cannot be before start date.";
    }
  } else if (
    !values.startDateTime ||
    !values.endDateTime ||
    localDateTimeToUtc(values.startDateTime) >=
      localDateTimeToUtc(values.endDateTime)
  ) {
    errors.endDateTime = "End must be after start.";
  }

  return errors;
}

function ErrorMessage({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  return message ? (
    <span id={id} role="alert">
      {message}
    </span>
  ) : null;
}

export function EventForm(props: EventFormProps) {
  const [values, setValues] = useState(props.initialValues);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const titleErrorId = useId();
  const calendarErrorId = useId();
  const allDayRangeErrorId = useId();
  const timedRangeErrorId = useId();

  useEffect(() => {
    setValues(props.initialValues);
    setErrors({});
  }, [props.resetKey]);

  const update = <Key extends keyof EventFormValues>(
    key: Key,
    value: EventFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (key === "startDate" || key === "endDate") {
        delete next.endDate;
      }
      if (key === "startDateTime" || key === "endDateTime") {
        delete next.endDateTime;
      }
      if (key === "isAllDay") {
        delete next.endDate;
        delete next.endDateTime;
      }
      if (key === "title") {
        const title = String(value).trim();
        if (title.length > 300) {
          next.title = "Title must be 300 characters or fewer.";
        }
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let nextErrors: EventFormErrors;
    try {
      nextErrors = validate(values);
    } catch {
      nextErrors = values.isAllDay
        ? { endDate: "Enter valid start and end dates." }
        : { endDateTime: "Enter valid start and end times." };
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const range = values.isAllDay
      ? allDayDatesToUtc(values.startDate, values.endDate)
      : {
          startUtc: localDateTimeToUtc(values.startDateTime),
          endUtc: localDateTimeToUtc(values.endDateTime),
        };
    const input = {
      calendarId: values.calendarId,
      title: values.title.trim(),
      description: values.description.trim() || null,
      isAllDay: values.isAllDay,
      ...range,
    };

    if (props.mode === "create") {
      void props.onSubmit({
        mode: "create",
        input: {
          ...input,
          createdByUserId: props.createdByUserId,
        },
      });
    } else {
      void props.onSubmit({ mode: "edit", input });
    }
  };

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      <label>
        Title
        <input
          aria-describedby={errors.title ? titleErrorId : undefined}
          aria-invalid={Boolean(errors.title)}
          disabled={props.pending}
          onChange={(event) => update("title", event.target.value)}
          value={values.title}
        />
      </label>
      <ErrorMessage id={titleErrorId} message={errors.title} />

      <label>
        Description
        <textarea
          disabled={props.pending}
          onChange={(event) => update("description", event.target.value)}
          value={values.description}
        />
      </label>

      <label>
        Calendar
        <select
          aria-describedby={
            errors.calendarId ? calendarErrorId : undefined
          }
          aria-invalid={Boolean(errors.calendarId)}
          disabled={props.pending}
          onChange={(event) => update("calendarId", event.target.value)}
          value={values.calendarId}
        >
          <option value="">Select a calendar</option>
          {props.calendars.map((calendar) => (
            <option key={calendar.calendarId} value={calendar.calendarId}>
              {calendar.name}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage id={calendarErrorId} message={errors.calendarId} />

      <label>
        <input
          checked={values.isAllDay}
          disabled={props.pending}
          onChange={(event) => update("isAllDay", event.target.checked)}
          type="checkbox"
        />
        All day
      </label>

      {values.isAllDay ? (
        <>
          <label>
            Start date
            <input
              aria-describedby={
                errors.endDate ? allDayRangeErrorId : undefined
              }
              aria-invalid={Boolean(errors.endDate)}
              disabled={props.pending}
              onChange={(event) => update("startDate", event.target.value)}
              type="date"
              value={values.startDate}
            />
          </label>
          <label>
            End date
            <input
              aria-describedby={
                errors.endDate ? allDayRangeErrorId : undefined
              }
              aria-invalid={Boolean(errors.endDate)}
              disabled={props.pending}
              onChange={(event) => update("endDate", event.target.value)}
              type="date"
              value={values.endDate}
            />
          </label>
          <ErrorMessage
            id={allDayRangeErrorId}
            message={errors.endDate}
          />
        </>
      ) : (
        <>
          <label>
            Start time
            <input
              aria-describedby={
                errors.endDateTime ? timedRangeErrorId : undefined
              }
              aria-invalid={Boolean(errors.endDateTime)}
              disabled={props.pending}
              onChange={(event) =>
                update("startDateTime", event.target.value)
              }
              type="datetime-local"
              value={values.startDateTime}
            />
          </label>
          <label>
            End time
            <input
              aria-describedby={
                errors.endDateTime ? timedRangeErrorId : undefined
              }
              aria-invalid={Boolean(errors.endDateTime)}
              disabled={props.pending}
              onChange={(event) => update("endDateTime", event.target.value)}
              type="datetime-local"
              value={values.endDateTime}
            />
          </label>
          <ErrorMessage
            id={timedRangeErrorId}
            message={errors.endDateTime}
          />
        </>
      )}

      <button
        className="button--primary"
        disabled={props.pending}
        type="submit"
      >
        {props.mode === "create" ? "Create event" : "Save changes"}
      </button>
    </form>
  );
}
