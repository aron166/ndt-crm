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

  it("keeps the tag colour as a small dot on a neutral chip", () => {
    const { container } = render(<TagChip name="dot" color="#22c55e" />);
    const chip = container.querySelector("span");
    const dot = chip?.querySelector("span[aria-hidden]") as HTMLElement | null;
    expect(chip?.style.backgroundColor).toBe("var(--ui-surface-muted)");
    expect(dot?.style.backgroundColor).toBe("rgb(34, 197, 94)");
  });
});
