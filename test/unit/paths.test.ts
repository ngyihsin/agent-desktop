import { describe, expect, it } from "vitest";
import { defaultProjectPath, slugify } from "../../src/paths";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("My Onboarding Project")).toBe("my-onboarding-project");
  });

  it("collapses repeated spaces / underscores to a single hyphen", () => {
    expect(slugify("foo   bar___baz")).toBe("foo-bar-baz");
  });

  it("strips non-alphanumeric characters except hyphens", () => {
    expect(slugify("Hello, World! (v2)")).toBe("hello-world-v2");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--leading and trailing--")).toBe("leading-and-trailing");
  });

  it("collapses runs of hyphens left after stripping", () => {
    expect(slugify("foo --- bar")).toBe("foo-bar");
  });

  it("falls back to 'project' when slug would be empty", () => {
    expect(slugify("!@#$%^&*()")).toBe("project");
    expect(slugify("")).toBe("project");
    expect(slugify("   ")).toBe("project");
  });

  it("preserves existing valid slugs untouched", () => {
    expect(slugify("already-good-slug")).toBe("already-good-slug");
  });
});

describe("defaultProjectPath", () => {
  it("composes <home>/agent-desktop-projects/<slug>", () => {
    expect(defaultProjectPath("/home/me", "My Project")).toBe(
      "/home/me/agent-desktop-projects/my-project",
    );
  });

  it("uses the slug, not the raw name", () => {
    expect(defaultProjectPath("/h", "Hello WORLD")).toBe(
      "/h/agent-desktop-projects/hello-world",
    );
  });
});
