import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CreateCalendarInput,
  PlannerCalendar,
  UpdateCalendarInput,
} from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import { Dialog } from "../../shared/dialog/Dialog";
import { useNotice } from "../../shared/notices/NoticeProvider";

const defaultCalendarColor = "#6C63E8";
const colorPattern = /^#[0-9A-F]{6}$/;

type CalendarFormValues = {
  name: string;
  description: string;
  colorHex: string;
};

type CalendarFormErrors = Partial<
  Record<keyof CalendarFormValues, string>
>;

type CommonCalendarDialogProps = {
  open: boolean;
  api: PlannerApi;
  userId: string;
  onClose: () => void;
};

type CalendarDialogProps =
  | (CommonCalendarDialogProps & {
      mode: "create";
      calendar?: never;
    })
  | (CommonCalendarDialogProps & {
      mode: "edit";
      calendar: PlannerCalendar;
    });

function normalizeColor(colorHex: string | null | undefined) {
  const normalized = colorHex?.toUpperCase();
  return normalized && colorPattern.test(normalized)
    ? normalized
    : defaultCalendarColor;
}

export function validateCalendarColor(colorHex: string) {
  return colorPattern.test(colorHex)
    ? undefined
    : "Color must be a six-digit hex value.";
}

function validateCalendar(values: CalendarFormValues) {
  const errors: CalendarFormErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length > 200) {
    errors.name = "Name must be 200 characters or fewer.";
  }
  if (values.description.trim().length > 1000) {
    errors.description =
      "Description must be 1000 characters or fewer.";
  }
  const colorError = validateCalendarColor(values.colorHex);
  if (colorError) {
    errors.colorHex = colorError;
  }

  return errors;
}

export function normalizeCalendarMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfterSeconds === undefined
        ? "Too many requests. Try again."
        : `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`;
    }
    return error.detail ?? error.message;
  }

  return error instanceof Error
    ? error.message
    : "Unable to save calendar.";
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

export function CalendarDialog(props: CalendarDialogProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotice();
  const nameErrorId = useId();
  const descriptionErrorId = useId();
  const colorInputId = useId();
  const colorValueId = useId();
  const colorErrorId = useId();
  const editorIdentity = `${props.userId}:${
    props.mode === "edit"
      ? `edit:${props.calendar.calendarId}`
      : "create"
  }`;
  const lifecycleKey = `${props.open}:${editorIdentity}`;
  const initialValues = useMemo<CalendarFormValues>(
    () =>
      props.mode === "edit"
        ? {
            name: props.calendar.name,
            description: props.calendar.description ?? "",
            colorHex: normalizeColor(props.calendar.colorHex),
          }
        : {
            name: "",
            description: "",
            colorHex: defaultCalendarColor,
          },
    [
      props.mode,
      props.mode === "edit" ? props.calendar.calendarId : undefined,
      props.open,
      props.userId,
    ],
  );
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<CalendarFormErrors>({});
  const [submissionPending, setSubmissionPending] = useState(false);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(lifecycleKey);
  const operationTokenRef = useRef(0);
  const submissionInFlightRef = useRef(false);

  const createCalendar = useMutation({
    mutationFn: (input: CreateCalendarInput) =>
      props.api.createCalendar(input),
  });
  const updateCalendar = useMutation({
    mutationFn: ({
      calendarId,
      input,
    }: {
      calendarId: string;
      input: UpdateCalendarInput;
    }) => props.api.updateCalendar(calendarId, input),
  });
  const busy = submissionPending;

  useLayoutEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationTokenRef.current += 1;
      submissionInFlightRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (lifecycleRef.current === lifecycleKey) {
      return;
    }

    lifecycleRef.current = lifecycleKey;
    operationTokenRef.current += 1;
    submissionInFlightRef.current = false;
    setSubmissionPending(false);
    setValues(initialValues);
    setErrors({});
  }, [initialValues, lifecycleKey]);

  const operationIsCurrent = (token: number) =>
    mountedRef.current &&
    token === operationTokenRef.current &&
    lifecycleRef.current === `true:${editorIdentity}`;

  const updateValue = <Key extends keyof CalendarFormValues>(
    key: Key,
    value: CalendarFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submissionInFlightRef.current) {
      return;
    }

    const nextErrors = validateCalendar(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submissionInFlightRef.current = true;
    setSubmissionPending(true);
    const operationToken = ++operationTokenRef.current;
    const operationUserId = props.userId;
    const input: UpdateCalendarInput = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      colorHex: values.colorHex,
    };

    try {
      if (props.mode === "create") {
        await createCalendar.mutateAsync({
          ...input,
          ownerUserId: operationUserId,
        });
        await queryClient.invalidateQueries({
          queryKey: ["calendars", operationUserId],
        });
        if (!operationIsCurrent(operationToken)) {
          return;
        }
        notify("Calendar created.", "success");
      } else {
        await updateCalendar.mutateAsync({
          calendarId: props.calendar.calendarId,
          input,
        });
        await queryClient.invalidateQueries({
          queryKey: ["calendars", operationUserId],
        });
        if (!operationIsCurrent(operationToken)) {
          return;
        }
        notify("Calendar updated.", "success");
      }
      props.onClose();
    } catch (error) {
      if (operationIsCurrent(operationToken)) {
        notify(normalizeCalendarMutationError(error), "error");
      }
    } finally {
      if (operationIsCurrent(operationToken)) {
        submissionInFlightRef.current = false;
        setSubmissionPending(false);
      }
    }
  };

  return (
    <Dialog
      className="calendar-dialog"
      focusKey={editorIdentity}
      open={props.open}
      title={
        props.mode === "create" ? "Create calendar" : "Edit calendar"
      }
      onClose={props.onClose}
      preventClose={busy}
    >
      <form className="calendar-form" noValidate onSubmit={handleSubmit}>
        <label>
          Name
          <input
            aria-describedby={errors.name ? nameErrorId : undefined}
            aria-invalid={Boolean(errors.name)}
            disabled={busy}
            onChange={(event) => updateValue("name", event.target.value)}
            value={values.name}
          />
        </label>
        <ErrorMessage id={nameErrorId} message={errors.name} />

        <label>
          Description
          <textarea
            aria-describedby={
              errors.description ? descriptionErrorId : undefined
            }
            aria-invalid={Boolean(errors.description)}
            disabled={busy}
            onChange={(event) =>
              updateValue("description", event.target.value)
            }
            value={values.description}
          />
        </label>
        <ErrorMessage
          id={descriptionErrorId}
          message={errors.description}
        />

        <label htmlFor={colorInputId}>Color</label>
        <input
          aria-describedby={`${colorValueId}${errors.colorHex ? ` ${colorErrorId}` : ""}`}
          aria-invalid={Boolean(errors.colorHex)}
          disabled={busy}
          id={colorInputId}
          onChange={(event) =>
            updateValue("colorHex", event.target.value.toUpperCase())
          }
          type="color"
          value={values.colorHex}
        />
        <output htmlFor={colorInputId} id={colorValueId}>
          Selected color: {values.colorHex}
        </output>
        <ErrorMessage id={colorErrorId} message={errors.colorHex} />

        <button className="button--primary" disabled={busy} type="submit">
          {props.mode === "create" ? "Create calendar" : "Save changes"}
        </button>
      </form>
    </Dialog>
  );
}
