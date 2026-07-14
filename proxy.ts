import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const productionSecurityHeaders = [
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
  ["Origin-Agent-Cluster", "?1"],
  [
    "Permissions-Policy",
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(self), screen-wake-lock=(), usb=(), web-share=(self), xr-spatial-tracking=()",
  ],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-DNS-Prefetch-Control", "off"],
  ["X-Download-Options", "noopen"],
  ["X-Frame-Options", "DENY"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["X-XSS-Protection", "0"],
] as const

export function createContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.gstatic.com https://www.google.com/recaptcha/${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' blob: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.web.app https://www.gstatic.com https://www.google.com/recaptcha/",
    "frame-src 'self' https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]

  if (!isDevelopment) directives.push("upgrade-insecure-requests")

  return `${directives.join("; ")};`
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDevelopment = process.env.NODE_ENV === "development"
  const contentSecurityPolicy = createContentSecurityPolicy(nonce, isDevelopment)
  const requestHeaders = new Headers(request.headers)

  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set("Content-Security-Policy", contentSecurityPolicy)
  for (const [name, value] of productionSecurityHeaders) {
    response.headers.set(name, value)
  }

  if (!isDevelopment) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
  }

  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
