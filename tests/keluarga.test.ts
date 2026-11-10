import { describe, expect, it } from "vitest";
import { tolakPeran } from "@/lib/auth";

describe("peran keluarga", () => {
  it("hanya pemilik/admin yang boleh mengelola pengaturan", () => {
    expect(tolakPeran({ role: "owner" }, "kelola")).toBeNull();
    expect(tolakPeran({ role: "admin" }, "kelola")).toBeNull();
    expect(tolakPeran({ role: "member" }, "kelola")).toBeInstanceOf(Response);
    expect(tolakPeran({ role: "viewer" }, "kelola")).toBeInstanceOf(Response);
  });

  it("viewer tidak boleh menulis, anggota boleh mengajukan transaksi", () => {
    expect(tolakPeran({ role: "viewer" }, "tulis")).toBeInstanceOf(Response);
    expect(tolakPeran({ role: "member" }, "tulis")).toBeNull();
    expect(tolakPeran({ role: "admin" }, "tulis")).toBeNull();
  });
});
