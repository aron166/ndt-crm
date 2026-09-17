import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders # as h2, ## as h3, ### as h4", () => {
    const { container } = render(<Markdown source={"# One\n## Two\n### Three"} />);
    expect(container.querySelector("h2")?.textContent).toBe("One");
    expect(container.querySelector("h3")?.textContent).toBe("Two");
    expect(container.querySelector("h4")?.textContent).toBe("Three");
  });

  it("renders unordered and ordered lists", () => {
    const { container } = render(<Markdown source={"- a\n- b\n\n1. first\n2. second"} />);
    const ul = container.querySelector("ul");
    const ol = container.querySelector("ol");
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ol?.querySelectorAll("li").length).toBe(2);
    expect(ol?.textContent).toContain("first");
  });

  it("renders bold and italic", () => {
    const { container } = render(<Markdown source={"**bold** and *italic* and _italic2_"} />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelectorAll("em").length).toBe(2);
  });

  it("does not parse markdown inside code blocks", () => {
    const { container } = render(<Markdown source={"```\n**not bold** [x](http://a)\n```"} />);
    const code = container.querySelector("pre code");
    expect(code?.textContent).toBe("**not bold** [x](http://a)");
    expect(code?.querySelector("strong")).toBeNull();
  });

  it("renders <script> as literal text, never as an element", () => {
    const { container } = render(<Markdown source={"before <script>alert(1)</script> after"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not render an anchor for javascript: links", () => {
    const { container } = render(<Markdown source={"[click me](javascript:alert(1))"} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click me");
  });

  it("renders an anchor for mailto: links with safe rel/target", () => {
    const { container } = render(<Markdown source={"[mail](mailto:a@b.com)"} />);
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("mailto:a@b.com");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.getAttribute("target")).toBe("_blank");
  });

  it("separates paragraphs on blank lines", () => {
    const { container } = render(<Markdown source={"para one\n\npara two"} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(2);
    expect(ps[0].textContent).toBe("para one");
    expect(ps[1].textContent).toBe("para two");
  });

  it("converts a single newline inside a paragraph to <br/>", () => {
    const { container } = render(<Markdown source={"line one\nline two"} />);
    const p = container.querySelector("p");
    expect(p?.querySelectorAll("br").length).toBe(1);
    expect(p?.textContent).toBe("line oneline two");
  });

  it("wraps output in a div with the given className", () => {
    const { container } = render(<Markdown source={"hi"} className="my-class" />);
    expect(container.querySelector("div.my-class")).not.toBeNull();
  });

  it("renders blockquote and horizontal rule", () => {
    const { container } = render(<Markdown source={"> quoted\n\n---"} />);
    expect(container.querySelector("blockquote")?.textContent).toBe("quoted");
    expect(container.querySelector("hr")).not.toBeNull();
  });
});
