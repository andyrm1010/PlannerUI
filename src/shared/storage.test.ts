import { afterEach, describe, expect, it, vi } from "vitest";
import { readStorage, writeStorage } from "./storage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safe storage", () => {
  it("reads and writes local storage values", () => {
    writeStorage("planner.test", "saved");

    expect(readStorage("planner.test")).toBe("saved");
  });

  it("returns null when local storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });

    expect(readStorage("planner.test")).toBeNull();
  });

  it("does not throw when local storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable");
    });

    expect(() => writeStorage("planner.test", "saved")).not.toThrow();
  });
});
