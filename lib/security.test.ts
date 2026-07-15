import { describe, expect, it } from "vitest"
import {
  isSafeImageUrl,
  validateEmail,
  validateFirestoreId,
  validatePassword,
  validatePhoneNumber,
} from "./security"

describe("frontend security validation", () => {
  it("accepts supported institutional email formats", () => {
    expect(validateEmail("student.name@btech.christuniversity.in")).toBe(true)
    expect(validateEmail("faculty.name@christuniversity.in")).toBe(true)
  })

  it("rejects malformed addresses and unsafe local parts", () => {
    expect(validateEmail("not-an-email")).toBe(false)
    expect(validateEmail("a@christuniversity.in")).toBe(false)
    expect(validateEmail("bad+alias@christuniversity.in")).toBe(false)
  })

  it("enforces the documented password policy", () => {
    expect(validatePassword("Strong#Pass1")).toBe(true)
    expect(validatePassword("weakpassword")).toBe(false)
    expect(validatePassword("NoSpecial1")).toBe(false)
  })

  it("validates profile and resource identifiers", () => {
    expect(validateFirestoreId("abc-123_DEF")).toBe(true)
    expect(validateFirestoreId("../admin")).toBe(false)
    expect(validateFirestoreId("__reserved__")).toBe(false)
  })

  it("allows HTTPS machine images only", () => {
    expect(isSafeImageUrl("https://assets.example.edu/machine.jpg")).toBe(true)
    expect(isSafeImageUrl("http://assets.example.edu/machine.jpg")).toBe(false)
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false)
  })

  it("accepts common international phone formatting", () => {
    expect(validatePhoneNumber("+91 98765 43210")).toBe(true)
    expect(validatePhoneNumber("123")).toBe(false)
  })
})
