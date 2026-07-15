"use client"

import { getFirebaseAuth } from "@/lib/firebase-client"
import type { ServiceError, ServiceResult } from "@/lib/types"

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  forceRefreshToken?: boolean
  signal?: AbortSignal
}

const REQUEST_TIMEOUT_MS = 20_000

function normalizeError(value: unknown, status?: number): ServiceError {
  if (typeof value === "object" && value) {
    const candidate = value as { message?: unknown; code?: unknown }
    return {
      message: typeof candidate.message === "string" && candidate.message.trim()
        ? candidate.message
        : "Request failed.",
      code: typeof candidate.code === "string" ? candidate.code : "request_failed",
      status,
    }
  }
  return { message: "Request failed.", code: "request_failed", status }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ServiceResult<T>> {
  if (!path.startsWith("/api/") || path.startsWith("//")) {
    return {
      data: null,
      error: { message: "Invalid API destination.", code: "invalid_api_path" },
    }
  }

  const { method = "GET", body, forceRefreshToken = false, signal } = options
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abortFromParent = () => controller.abort()
  signal?.addEventListener("abort", abortFromParent, { once: true })

  try {
    const currentUser = getFirebaseAuth().currentUser
    if (!currentUser) {
      return {
        data: null,
        error: { message: "Authentication required.", code: "auth_required", status: 401 },
      }
    }

    const token = await currentUser.getIdToken(forceRefreshToken)
    const response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      responseHeaders[name.toLowerCase()] = value
    })
    const responseMetadata = { headers: Object.freeze(responseHeaders) }

    const payload = await response.json().catch(() => null) as {
      data?: T
      error?: unknown
    } | null

    if (!response.ok || payload?.error) {
      return {
        data: null,
        error: normalizeError(payload?.error, response.status),
        response: responseMetadata,
      }
    }

    return {
      data: (payload?.data ?? null) as T,
      error: null,
      response: responseMetadata,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        data: null,
        error: {
          message: signal?.aborted ? "Request cancelled." : "The request timed out. Please try again.",
          code: signal?.aborted ? "request_cancelled" : "request_timeout",
        },
      }
    }
    return {
      data: null,
      error: {
        message: "Network error. Check your connection and try again.",
        code: "network_error",
      },
    }
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener("abort", abortFromParent)
  }
}
