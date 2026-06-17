import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateEventInput,
  UpdateEventInput,
} from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";

export function normalizeEventMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfterSeconds === undefined
        ? "Too many requests. Try again."
        : `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`;
    }
    return error.detail ?? error.message;
  }
  return error instanceof Error ? error.message : "Unable to save event.";
}

function useInvalidateEvents(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: ["events", userId],
    });
}

export function useCreateEvent(api: PlannerApi, userId: string) {
  const invalidateEvents = useInvalidateEvents(userId);
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.createEvent(input),
    onSuccess: invalidateEvents,
  });
}

export function useUpdateEvent(api: PlannerApi, userId: string) {
  const invalidateEvents = useInvalidateEvents(userId);
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: UpdateEventInput;
    }) => api.updateEvent(eventId, input),
    onSuccess: invalidateEvents,
  });
}

export function useDeleteEvent(api: PlannerApi, userId: string) {
  const invalidateEvents = useInvalidateEvents(userId);
  return useMutation({
    mutationFn: (eventId: string) => api.deleteEvent(eventId),
    onSuccess: invalidateEvents,
  });
}
