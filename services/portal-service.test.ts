import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock("@/lib/security", () => ({ validateFirestoreId: vi.fn(() => true) }))
vi.mock("@/services/api-client", () => ({ apiRequest: mocks.apiRequest }))

import { auditService, userService } from "./portal-service"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("cursor-paginated portal services", () => {
  it("consumes the audit cursor header and forwards encoded filters and cursor", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: [{ id: "audit-1" }],
      error: null,
      response: { headers: { "x-audit-next-cursor": "next-audit-page" } },
    })

    const result = await auditService.getAuditLog({
      entity_type: "booking",
      action: "booking.approved",
      cursor: "current/page",
      limit: 25,
    })

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/audit-log?entity_type=booking&action=booking.approved&cursor=current%2Fpage&limit=25",
    )
    expect(result).toMatchObject({
      data: { items: [{ id: "audit-1" }], nextCursor: "next-audit-page" },
      error: null,
    })
  })

  it("consumes the user cursor header and treats an empty cursor as the final page", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: [{ id: "user-1" }],
      error: null,
      response: { headers: { "x-users-next-cursor": "" } },
    })

    const result = await userService.getUsers({ status: "active", role: "admin", limit: 50 })

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/users?status=active&role=admin&limit=50",
    )
    expect(result).toMatchObject({
      data: { items: [{ id: "user-1" }], nextCursor: null },
      error: null,
    })
  })

  it("fails closed when a cursor header does not match the opaque cursor contract", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: [{ id: "user-1" }],
      error: null,
      response: { headers: { "x-users-next-cursor": "not/a/cursor" } },
    })

    await expect(userService.getUsers()).resolves.toMatchObject({
      data: null,
      error: { code: "invalid_response" },
    })
  })
})
