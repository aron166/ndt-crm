import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";

describe("PipelineStatusBadge", () => {
  it("renders the correct label for pipeline status 1", () => {
    render(<PipelineStatusBadge status={1} />);
    expect(screen.getByText("Nem hívtuk")).toBeTruthy();
  });

  it("renders for string status codes from ETL", () => {
    render(<PipelineStatusBadge status="3" />);
    expect(screen.getByText("Érdeklődő")).toBeTruthy();
  });

  it("renders CW for status 8", () => {
    render(<PipelineStatusBadge status={8} />);
    expect(screen.getByText("CW")).toBeTruthy();
  });

  it("falls back gracefully for null status", () => {
    render(<PipelineStatusBadge status={null} />);
    expect(screen.getByText("Nem hívtuk")).toBeTruthy();
  });

  it("falls back for unknown status", () => {
    render(<PipelineStatusBadge status={99} />);
    expect(screen.getByText("Nem hívtuk")).toBeTruthy();
  });
});
