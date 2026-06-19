import { lazy, Suspense, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { createPlannerApi, type PlannerApi } from "../api/plannerApi";
import { runtimeConfig, type RuntimeConfig, type RuntimeConfigResult } from "../config/runtimeConfig";
import { AppShell } from "./AppShell";

const CalendarPage = lazy(() =>
  import("../features/calendar/CalendarPage").then((module) => ({
    default: module.CalendarPage,
  })),
);
const CalendarsPage = lazy(() =>
  import("../features/calendars/CalendarsPage").then((module) => ({
    default: module.CalendarsPage,
  })),
);
const ProfilePage = lazy(() =>
  import("../features/profile/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);

type AppProps = {
  config?: RuntimeConfigResult;
};

function RouteLoadingFallback() {
  return (
    <p aria-live="polite" role="status">
      Loading page
    </p>
  );
}

function SetupScreen({ errors, onClear }: { errors: string[]; onClear?: () => void }) {
  return (
    <main className="setup-screen">
      <h1>Planner setup required</h1>
      {errors.length > 0 && (
        <>
          <ul aria-label="Setup errors">
            {errors.map((error) => (
              <li key={error} role="alert">{error}</li>
            ))}
          </ul>
          {onClear && (
            <button onClick={onClear} style={{ marginTop: "1rem" }}>
              Clear error state and retry
            </button>
          )}
        </>
      )}
    </main>
  );
}

function UserCreationForm({ showSetupErrors = [] }: { showSetupErrors: string[] }) {
  const api = createPlannerApi(
    (runtimeConfig as any).apiBaseUrl ?? "http://localhost:5000",
  );

  // If there are setup errors, display them alongside the form
  if (showSetupErrors.length > 0) {
    return (
      <section className="route-page route-page--setup">
        <h1>Planner setup required</h1>
        <p>No existing users were found. To continue, you need to either:</p>
        <ul>
          <li>Start the PlannerService backend API on {`http://localhost:5000`}</li>
          <li>Create a user directly via the database</li>
        </ul>
        {showSetupErrors.length > 0 && (
          <>
            <p style={{ marginTop: "1rem" }}>The following configuration issues were detected:</p>
            <ul aria-label="setup errors">
              {showSetupErrors.map((error) => (
                <li key={error} role="alert">{error}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }
  const [displayNameError, setDisplayNameError] = useState<string>();
  const [submissionPending, setSubmissionPending] = useState(false);

  type CreateUserFormValues = {
    displayName: string;
    email: string;
    firstName: string;
    lastName: string;
  };

  const emptyValues: CreateUserFormValues = {
    displayName: "",
    email: "",
    firstName: "",
    lastName: "",
  };
  const [values, setValues] = useState<CreateUserFormValues>(emptyValues);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending) return;

    // Basic client-side validation
    if (!values.email.trim()) {
      alert("Please enter your email address.");
      return;
    }
    if (!values.displayName.trim()) {
      setDisplayNameError("Display name is required.");
      return;
    } else {
      setDisplayNameError(undefined);
    }

    setSubmissionPending(true);

    // Create user via API
    const userInput: any = {
      email: values.email,
      displayName: values.displayName,
      firstName: values.firstName || null,
      lastName: values.lastName || null,
    };

    api.createUser(userInput).then((response) => {
      setSubmissionPending(false);
      // Persist the userId to localStorage so it survives page refresh
      localStorage.setItem("planner_user_id", response.userId);
      alert("User created successfully! Redirecting to calendar...");
      window.location.href = "/calendar";
    }).catch((error) => {
      setSubmissionPending(false);
      // If API call fails, show error to user
      console.error("Failed to create user:", error);
      alert(`Failed to create user: ${error.message || "Unknown error"}`);
    });
  }

  return (
    <section className="route-page route-page--setup">
      <h1>Create your user</h1>
      <p>
        No existing users were found. Please create a new user account to continue.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Email (required)
          <input
            required
            aria-required="true"
            disabled={submissionPending}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
            placeholder="you@example.com"
            type="email"
            value={values.email}
          />
        </label>

        <label>
          Display name (required)
          <input
            aria-invalid={Boolean(displayNameError)}
            aria-describedby={displayNameError ? "display-name-error" : undefined}
            disabled={submissionPending}
            onChange={(event) => setValues({ ...values, displayName: event.target.value })}
            placeholder="Jane Smith"
            type="text"
            value={values.displayName}
          />
        </label>
        {displayNameError && (
          <span id="display-name-error" role="alert">
            {displayNameError}
          </span>
        )}

        <label>
          First name (optional)
          <input
            disabled={submissionPending}
            onChange={(event) => setValues({ ...values, firstName: event.target.value })}
            placeholder="Jane"
            type="text"
            value={values.firstName}
          />
        </label>

        <label>
          Last name (optional)
          <input
            disabled={submissionPending}
            onChange={(event) => setValues({ ...values, lastName: event.target.value })}
            placeholder="Smith"
            type="text"
            value={values.lastName}
          />
        </label>

        <button
          className="button--primary"
          disabled={submissionPending}
          type="submit"
        >
          {submissionPending ? "Creating user..." : "Create my account"}
        </button>
      </form>
    </section>
  );
}

function AppRoutes({ api, userId }: { api: PlannerApi; userId: string }) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/calendar" />} />
        <Route element={<AppShell />}>
          <Route path="/calendar" element={<CalendarPage api={api} userId={userId} />} />
          <Route path="/calendars" element={<CalendarsPage api={api} userId={userId} />} />
          <Route path="/profile" element={<ProfilePage api={api} userId={userId} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function NotFoundPage() {
  return (
    <section className="route-page route-page--not-found">
      <h1>Page not found</h1>
      <Link to="/calendar">Go to Calendar</Link>
    </section>
  );
}

function ConfiguredApp({ config, userId }: { config: RuntimeConfig; userId: string }) {
  const api = useMemo(
    () => createPlannerApi(config.apiBaseUrl),
    [config.apiBaseUrl],
  );

  return <AppRoutes api={api} userId={userId} />;
}

export function App({ config = runtimeConfig }: AppProps) {
  // Check if user creation is needed (no existing user found by API)
  const hasDemoUserIdMissingFlag = "demoUserIdMissing" in config && config.demoUserIdMissing === true;

  // Priority 1: If user creation is needed, show the form (first-run state)
  if (hasDemoUserIdMissingFlag) {
    const setupErrors: string[] = "errors" in config ? (config.errors as string[]) : [];
    return <UserCreationForm showSetupErrors={setupErrors} />;
  }

  // Priority 2: Check for setup errors (API configuration issues)
  // Only show setup screen if profile creation is NOT needed
  if ("errors" in config && "length" in config.errors && config.errors.length > 0) {
    return <SetupScreen errors={config.errors} />;
  }

  // If we get here, it's a normal config with apiBaseUrl and demoUserId
  const validConfig = config as RuntimeConfig;
  return <ConfiguredApp config={validConfig} userId={validConfig.demoUserId} />;
}
