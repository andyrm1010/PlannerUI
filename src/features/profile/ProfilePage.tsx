import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { PlannerUser } from "../../api/contracts";
import { ApiError } from "../../api/http";
import type { PlannerApi } from "../../api/plannerApi";
import { useNotice } from "../../shared/notices/NoticeProvider";

type ProfilePageProps = {
  api: PlannerApi;
  userId: string;
};

type ProfileFormValues = {
  displayName: string;
  firstName: string;
  lastName: string;
};

const emptyValues: ProfileFormValues = {
  displayName: "",
  firstName: "",
  lastName: "",
};

function toFormValues(user: PlannerUser): ProfileFormValues {
  return {
    displayName: user.displayName,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
  };
}

function getInitials(user: PlannerUser) {
  const nameInitials = [user.firstName, user.lastName]
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim().charAt(0))
    .join("");

  if (nameInitials) {
    return nameInitials.toUpperCase();
  }

  const displayParts = user.displayName.trim().split(/\s+/).filter(Boolean);
  if (displayParts.length > 0) {
    return `${displayParts[0].charAt(0)}${
      displayParts.length > 1
        ? displayParts[displayParts.length - 1].charAt(0)
        : ""
    }`.toUpperCase();
  }

  return user.email.trim().charAt(0).toUpperCase() || "?";
}

export function normalizeProfileMutationError(error: unknown): string {
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
    : "Unable to save profile.";
}

export function ProfilePage({ api, userId }: ProfilePageProps) {
  const queryClient = useQueryClient();
  const { notify } = useNotice();
  const displayNameErrorId = useId();
  const [values, setValues] = useState<ProfileFormValues>(emptyValues);
  const [displayNameError, setDisplayNameError] = useState<string>();
  const [submissionPending, setSubmissionPending] = useState(false);
  const mountedRef = useRef(false);
  const userScopeRef = useRef(userId);
  const operationTokenRef = useRef(0);
  const submissionInFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const userQuery = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });
  const updateUser = useMutation({
    mutationFn: ({
      operationUserId,
      user,
    }: {
      operationUserId: string;
      user: PlannerUser;
    }) => api.updateUser(operationUserId, user),
  });

  useLayoutEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationTokenRef.current += 1;
      submissionInFlightRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (userScopeRef.current === userId) {
      return;
    }

    userScopeRef.current = userId;
    operationTokenRef.current += 1;
    submissionInFlightRef.current = false;
    dirtyRef.current = false;
    setSubmissionPending(false);
    setValues(emptyValues);
    setDisplayNameError(undefined);
  }, [userId]);

  useEffect(() => {
    if (
      userQuery.data &&
      userScopeRef.current === userId &&
      !dirtyRef.current
    ) {
      setValues(toFormValues(userQuery.data));
    }
  }, [userId, userQuery.data]);

  if (userQuery.isLoading) {
    return (
      <p aria-live="polite" role="status">
        Loading profile
      </p>
    );
  }

  const user = userQuery.data;

  if (userQuery.isError && !user) {
    return (
      <section className="route-page route-page--profile">
        <h1>Profile</h1>
        <p role="alert">Unable to load profile.</p>
        <button onClick={() => void userQuery.refetch()} type="button">
          Retry
        </button>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="route-page route-page--profile">
        <h1>Profile</h1>
        <p>Profile not found.</p>
      </section>
    );
  }

  const updateValue = (
    key: keyof ProfileFormValues,
    value: string,
  ) => {
    dirtyRef.current = true;
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "displayName") {
      setDisplayNameError(undefined);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlightRef.current) {
      return;
    }

    const displayName = values.displayName.trim();
    if (!displayName) {
      setDisplayNameError("Display name is required.");
      return;
    }

    submissionInFlightRef.current = true;
    setSubmissionPending(true);
    const operationToken = ++operationTokenRef.current;
    const operationUserId = userId;
    const operationUser = user;
    const updatedUser: PlannerUser = {
      ...operationUser,
      displayName,
      firstName: values.firstName.trim() || null,
      lastName: values.lastName.trim() || null,
    };
    const operationIsCurrent = () =>
      mountedRef.current &&
      operationToken === operationTokenRef.current &&
      userScopeRef.current === operationUserId;

    try {
      await updateUser.mutateAsync({
        operationUserId,
        user: updatedUser,
      });
    } catch (error) {
      if (operationIsCurrent()) {
        notify(normalizeProfileMutationError(error), "error");
        submissionInFlightRef.current = false;
        setSubmissionPending(false);
      }
      return;
    }

    queryClient.setQueryData(["user", operationUserId], updatedUser);
    if (operationIsCurrent()) {
      dirtyRef.current = false;
      setValues(toFormValues(updatedUser));
      setDisplayNameError(undefined);
      notify("Profile updated.", "success");
    }

    try {
      await queryClient.invalidateQueries(
        {
          queryKey: ["user", operationUserId],
        },
        { throwOnError: true },
      );
      if (!operationIsCurrent()) {
        return;
      }
      const reconciledUser =
        queryClient.getQueryData<PlannerUser>([
          "user",
          operationUserId,
        ]) ?? updatedUser;
      dirtyRef.current = false;
      setValues(toFormValues(reconciledUser));
      setDisplayNameError(undefined);
    } catch {
      // The update is committed; the query error renders a retryable warning.
    } finally {
      if (operationIsCurrent()) {
        submissionInFlightRef.current = false;
        setSubmissionPending(false);
      }
    }
  };

  return (
    <section className="route-page route-page--profile">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1>Profile</h1>
        {(() => {
          // Add logout button for clearing session
          const storageKey = "planner_user_id";
          return (
            <button
              onClick={() => {
                localStorage.removeItem(storageKey);
                window.location.href = "/calendar";
              }}
              style={{
                padding: "0.5rem 1rem",
                background: "#ff4444",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Log out
            </button>
          );
        })()}
      </header>
      <div aria-label="Profile initials" className="profile-avatar">
        {getInitials(user)}
      </div>
      {userQuery.isError ? (
        <div>
          <p role="status">Unable to refresh profile.</p>
          <button
            aria-label="Retry profile refresh"
            onClick={() => void userQuery.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      <form
        aria-busy={submissionPending}
        noValidate
        onSubmit={handleSubmit}
      >
        <label>
          Display name
          <input
            aria-describedby={
              displayNameError ? displayNameErrorId : undefined
            }
            aria-invalid={Boolean(displayNameError)}
            disabled={submissionPending}
            onChange={(event) =>
              updateValue("displayName", event.target.value)
            }
            value={values.displayName}
          />
        </label>
        {displayNameError ? (
          <span id={displayNameErrorId} role="alert">
            {displayNameError}
          </span>
        ) : null}
        <label>
          First name
          <input
            disabled={submissionPending}
            onChange={(event) =>
              updateValue("firstName", event.target.value)
            }
            value={values.firstName}
          />
        </label>
        <label>
          Last name
          <input
            disabled={submissionPending}
            onChange={(event) =>
              updateValue("lastName", event.target.value)
            }
            value={values.lastName}
          />
        </label>
        <label>
          Email
          <input
            disabled={submissionPending}
            readOnly
            type="email"
            value={user.email}
          />
        </label>
        <label>
          Time zone
          <input
            disabled={submissionPending}
            readOnly
            value={user.timeZoneId}
          />
        </label>
        <p>Email and time-zone editing are planned for a future update.</p>
        <button
          className="button--primary"
          disabled={submissionPending}
          type="submit"
        >
          {submissionPending ? "Saving..." : "Save profile"}
        </button>
      </form>
    </section>
  );
}
