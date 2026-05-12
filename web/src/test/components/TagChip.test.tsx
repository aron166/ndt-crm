import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagChip } from "@/components/tags/TagChip";

describe("TagChip", () => {
  it("renders the tag name", () => {
    render(<TagChip name="BirdsView Q3" color="#6366f1" />);
    expect(screen.getByText("BirdsView Q3")).toBeTruthy();
  });

  it("shows remove button when onRemove is provided", () => {
    const onRemove = vi.fn();
    render(<TagChip name="test" color="#6366f1" onRemove={onRemove} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("calls onRemove when X is clicked", async () => {
    const onRemove = vi.fn();
    render(<TagChip name="test" color="#6366f1" onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("does not render remove button without onRemove", () => {
    render(<TagChip name="readonly" color="#22c55e" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses dark text on light background", () => {
    const { container } = render(<TagChip name="light" color="#ffffff" />);
    const span = container.querySelector("span");
    expect(span?.style.color).toBe("rgb(30, 41, 59)"); // #1e293b
  });

  it("uses light text on dark background", () => {
    const { container } = render(<TagChip name="dark" color="#1e293b" />);
    const span = container.querySelector("span");
    expect(span?.style.color).toBe("rgb(255, 255, 255)");
  });
});
