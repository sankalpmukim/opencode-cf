import { DurableObject } from "cloudflare:workers"
import { ServerWorkerd } from "@opencode-ai/server/workerd"
import { Effect, Scope } from "effect"

type OpenCodeHandler = (request: Request) => Promise<Response>

const INSTANCE_NAME = "private"
const USERNAME = "opencode"

const CONFIG = {
  $schema: "https://opencode.ai/config.json",
  default_agent: "build",
} as const

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="opencode"',
      "Cache-Control": "no-store",
    },
  })
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: BufferSource, y: BufferSource) => boolean
  }
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(a, b)
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function secretsEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(left), digest(right)])
  return buffersEqual(a, b)
}

async function authorized(request: Request, password: string): Promise<boolean> {
  const header = request.headers.get("Authorization")
  if (!header?.startsWith("Basic ")) return false
  try {
    const decoded = atob(header.slice(6))
    const index = decoded.indexOf(":")
    if (index < 0) return false
    const username = decoded.slice(0, index)
    const secret = decoded.slice(index + 1)
    const [userOk, passOk] = await Promise.all([
      secretsEqual(username, USERNAME),
      secretsEqual(secret, password),
    ])
    return userOk && passOk
  } catch {
    return false
  }
}

async function bootHandler(
  storage: DurableObjectStorage,
  password: string,
): Promise<OpenCodeHandler> {
  const scope = Scope.makeUnsafe()
  return Effect.runPromise(
    ServerWorkerd.create({
      storage,
      password,
      config: { content: JSON.stringify(CONFIG) },
    }).pipe(Scope.provide(scope)),
  )
}

export class OpenCodeInstance extends DurableObject<Env> {
  private readonly handler: Promise<OpenCodeHandler>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const password = env.OPENCODE_SERVER_PASSWORD
    this.handler = ctx.blockConcurrencyWhile(() => bootHandler(ctx.storage, password))
  }

  async fetch(request: Request): Promise<Response> {
    const handle = await this.handler
    return handle(request)
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      })
    }

    if (!(await authorized(request, env.OPENCODE_SERVER_PASSWORD))) {
      return unauthorized()
    }

    const stub = env.OPENCODE.getByName(INSTANCE_NAME)
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
