import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("AppShell", () => {
  it("navigates between Calendar, Calendars, and Profile routes", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/calendar" element={<h1>Calendar</h1>} />
            <Route path="/calendars" element={<h1>Calendars</h1>} />
            <Route path="/profile" element={<h1>Profile</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeVisible();
    expect(
      within(primaryNavigation).getByRole("link", { name: "Calendar" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");

    await user.click(within(primaryNavigation).getByRole("link", {
      name: "Calendars",
    }));
    expect(screen.getByRole("heading", { name: "Calendars" })).toBeVisible();
    expect(
      within(primaryNavigation).getByRole("link", { name: "Calendar" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      within(primaryNavigation).getByRole("link", { name: "Calendars" }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(within(primaryNavigation).getByRole("link", {
      name: "Profile",
    }));
    expect(screen.getByRole("heading", { name: "Profile" })).toBeVisible();
    expect(
      within(primaryNavigation).getByRole("link", { name: "Calendars" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      within(primaryNavigation).getByRole("link", { name: "Profile" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
