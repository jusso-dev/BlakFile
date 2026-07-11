import { describe, it, expect } from "vitest";
import { childPath, createFolderSchema, displayName } from "./validation";

describe("childPath", () => {
  it("builds a root child path", () => {
    expect(childPath(null, "Projects")).toBe("/Projects/");
  });
  it("builds a nested child path", () => {
    expect(childPath("/Projects/", "2026")).toBe("/Projects/2026/");
  });
});

describe("displayName", () => {
  it("rejects path separators and traversal", () => {
    expect(displayName.safeParse("a/b").success).toBe(false);
    expect(displayName.safeParse("..").success).toBe(false);
    expect(displayName.safeParse("a\\b").success).toBe(false);
    expect(displayName.safeParse(" leading").success).toBe(false);
  });
  it("accepts an ordinary name", () => {
    expect(displayName.safeParse("Q3 Reports").success).toBe(true);
  });
});

describe("createFolderSchema", () => {
  it("requires a uuid driveId", () => {
    expect(createFolderSchema.safeParse({ driveId: "nope", name: "x" }).success).toBe(false);
  });
});
