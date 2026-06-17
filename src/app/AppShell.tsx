import { CalendarDays, Layers3, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/calendars", label: "Calendars", icon: Layers3 },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

type NavigationProps = {
  ariaLabel: string;
  className: string;
};

function Navigation({ ariaLabel, className }: NavigationProps) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="app-navigation__link">
          <Icon aria-hidden="true" className="app-navigation__icon" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="app-header">
        <span className="app-header__brand">Planner</span>
        <Navigation
          ariaLabel="Primary navigation"
          className="app-navigation app-navigation--desktop"
        />
      </header>

      <main id="main-content" className="app-main">
        <Outlet />
      </main>

      <Navigation
        ariaLabel="Mobile navigation"
        className="app-navigation app-navigation--mobile"
      />
    </div>
  );
}
