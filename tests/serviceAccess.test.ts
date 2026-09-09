import { describe, expect, it } from "vitest";
import { serviceAccessKey, serviceRoleScope } from "@/lib/serviceAccess.js";

describe("service access scope format", () => {
  it("formats the built-in Devs admin role exactly as DEVS-ADMIN", () => {
    expect(serviceRoleScope(serviceAccessKey("Devs"), "ADMIN")).toBe("DEVS-ADMIN");
  });

  it("formats a custom Devs role exactly as DEVS-MENTOR", () => {
    expect(serviceRoleScope(serviceAccessKey("Devs"), "MENTOR")).toBe("DEVS-MENTOR");
  });
});
