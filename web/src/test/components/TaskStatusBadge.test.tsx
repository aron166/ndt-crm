import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";

describe("TaskStatusBadge", () => {
  it("renders Kiírva for created status", () => {
    render(<TaskStatusBadge status="created" />);
    expect(screen.getByText("Kiírva")).toBeTruthy();
  });

  it("renders Kiírva for legacy not_started status", () => {
    render(<TaskStatusBadge status="not_started" />);
    expect(screen.getByText("Kiírva")).toBeTruthy();
  });

  it("renders Folyamatban for in_progress", () => {
    render(<TaskStatusBadge status="in_progress" />);
    expect(screen.getByText("Folyamatban")).toBeTruthy();
  });

  it("renders Elvégezve for done", () => {
    render(<TaskStatusBadge status="done" />);
    expect(screen.getByText("Elvégezve")).toBeTruthy();
  });

  it("renders Törölve for cancelled", () => {
    render(<TaskStatusBadge status="cancelled" />);
    expect(screen.getByText("Törölve")).toBeTruthy();
  });

  it("falls back gracefully for unknown status", () => {
    render(<TaskStatusBadge status="unknown_xyz" />);
    expect(screen.getByText("Kiírva")).toBeTruthy();
  });
});
