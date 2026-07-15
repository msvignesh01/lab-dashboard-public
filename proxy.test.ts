import { describe, expect, it } from "vitest"
import { createContentSecurityPolicy, permissionsPolicy } from "./proxy"

const directive = (policy: string, name: string) => (
  policy
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name} `)) ?? ""
)

describe("content security policy", () => {
  it("permits only the configured Google reCAPTCHA endpoints needed by Firebase Auth", () => {
    const policy = createContentSecurityPolicy("test-nonce", false)

    expect(directive(policy, "script-src")).toContain("https://www.google.com/recaptcha/")
    expect(directive(policy, "connect-src")).toContain("https://www.google.com/recaptcha/")
    expect(directive(policy, "frame-src")).toContain("https://www.google.com/recaptcha/")
    expect(directive(policy, "frame-src")).toContain("https://recaptcha.google.com/recaptcha/")
    expect(policy).not.toContain("recaptcha.net")
  })

  it("does not add unsafe script evaluation outside development", () => {
    const productionScriptPolicy = directive(createContentSecurityPolicy("prod", false), "script-src")

    expect(productionScriptPolicy).toContain("'wasm-unsafe-eval'")
    expect(productionScriptPolicy).not.toContain("'unsafe-eval'")
    expect(directive(createContentSecurityPolicy("dev", true), "script-src"))
      .toContain("'unsafe-eval'")
  })
})

describe("permissions policy", () => {
  it("disables the browser Web Share API", () => {
    expect(permissionsPolicy).toContain("web-share=()")
    expect(permissionsPolicy).not.toContain("web-share=(self)")
  })
})
