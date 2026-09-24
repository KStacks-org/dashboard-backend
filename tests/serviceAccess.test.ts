import { describe, expect, it } from "vitest";
import {
  normalizeAccessScope,
  serviceAccessKey,
  serviceRoleScope,
} from "@/lib/serviceAccess.js";

describe("service access scope format", () => {
  it("formats the built-in Devs admin role exactly as devs-admin", () => {
    expect(serviceRoleScope(serviceAccessKey("Devs"), "ADMIN")).toBe("devs-admin");
  });

  it("formats a custom Devs role exactly as devs-mentor", () => {
    expect(serviceRoleScope(serviceAccessKey("Devs"), "MENTOR")).toBe("devs-mentor");
  });

  it("normalizes incoming scope identifiers to lowercase", () => {
    expect(normalizeAccessScope("  DEVS-ADMIN  ")).toBe("devs-admin");
  });
});
