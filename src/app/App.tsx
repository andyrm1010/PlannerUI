import { lazy, Suspense, useMemo } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { createPlannerApi, type PlannerApi } from "../api/plannerApi";
import { runtimeConfig, type RuntimeConfigResult } from "../config/runtimeConfig";
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

function SetupScreen({ errors }: { errors: string[] }) {
  return (
    <main className="setup-screen">
      <h1>Planner setup required</h1>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </main>
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

function AppRoutes({
  api,
  demoUserId,
}: {
  api: PlannerApi;
  demoUserId: string;
}) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/calendar" />} />
        <Route element={<AppShell />}>
          <Route
            path="/calendar"
            element={<CalendarPage api={api} userId={demoUserId} />}
          />
          <Route
            path="/calendars"
            element={<CalendarsPage api={api} userId={demoUserId} />}
          />
          <Route
            path="/profile"
            element={<ProfilePage api={api} userId={demoUserId} />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function ConfiguredApp({
  config,
}: {
  config: Exclude<RuntimeConfigResult, { errors: string[] }>;
}) {
  const api = useMemo(
    () => createPlannerApi(config.apiBaseUrl),
    [config.apiBaseUrl],
  );

  return <AppRoutes api={api} demoUserId={config.demoUserId} />;
}

export function App({ config = runtimeConfig }: AppProps) {
  if ("errors" in config) {
    return <SetupScreen errors={config.errors} />;
  }

  return <ConfiguredApp config={config} />;
}
