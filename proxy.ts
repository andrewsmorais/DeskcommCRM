import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";
import { isPublicPath } from "@/lib/auth/public-paths";
import { motivoDeRecusaDoJson } from "@/lib/seguranca/entrada";
import {
  verifyImpersonateCookieEdge,
  IMPERSONATE_COOKIE_NAME_EDGE,
} from "@/lib/impersonate/cookie-edge";

const COOKIE_NAME = "sb-deskcomm-auth";

/** Corpo JSON maior que isto não é conferido aqui (a rota tem o próprio teto). */
const MAX_CORPO_CONFERIDO = 2 * 1024 * 1024;

function recusa(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return new NextResponse(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // `x-pathname` é do SERVIDOR: o layout de /app decide o muro da assinatura por
  // ele. O `NextResponse.next({ request: { headers } })` tira a foto dos
  // cabeçalhos NA CONSTRUÇÃO — um `request.headers.set` depois não chega ao
  // destino, e o valor que chegava era o que o CLIENTE mandou. Por isso o
  // cabeçalho é montado ANTES, numa cópia, sobrescrevendo qualquer valor vindo
  // de fora (`set` substitui; nunca `append`).
  const encaminhados = new Headers(request.headers);
  encaminhados.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: encaminhados } });

  // Inject X-Request-Id for downstream correlation (audit log, error wrappers).
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);

  // Recupera retornos de OAuth social já emitidos antes da landing pública existir.
  // Apenas a navegação é tratada: o vínculo de conta segue protegido pelos guards canônicos.
  // Passa adiante só o SINAL `connected=1` — nunca o `connect_token` nem o valor recebido.
  if (
    request.method === "GET" &&
    pathname === "/app/connections" &&
    request.nextUrl.searchParams.has("connected") &&
    request.nextUrl.searchParams.has("connect_token")
  ) {
    const landing = NextResponse.redirect(new URL("/auth/social-return?connected=1", request.url));
    landing.headers.set("Cache-Control", "no-store");
    landing.headers.set("Referrer-Policy", "no-referrer");
    return landing;
  }
  // Expõe o pathname também na resposta (diagnóstico); o que os Server
  // Components leem é o cabeçalho de REQUISIÇÃO montado acima.
  response.headers.set("x-pathname", pathname);

  // EPIC-11: the admin surface is reached by PATH (`/admin/*`) — the self-host kit
  // points `NEXT_PUBLIC_ADMIN_URL` at the same host as the app and maps no `admin.`
  // sub-domain. The host-based branch below stays a NOOP today and only exists as
  // documentation of the intended deploy topology.
  const host = request.headers.get("host") ?? "";
  const isAdminSurface = host.startsWith("admin.") || pathname.startsWith("/admin");

  if (isPublicPath(pathname)) {
    return response;
  }

  const supabase = createServerClient(
    // #1082: base na URL pública, endereço interno só no transporte (ver
    // `lib/supabase/fetch-do-servidor.ts`). O middleware não gera link, mas
    // segue a mesma regra dos outros dois clients — um desenho só.
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        fetch: fetchDoServidor(
          urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
          env.NEXT_PUBLIC_SUPABASE_URL,
        ),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
      cookieOptions: {
        name: COOKIE_NAME,
        sameSite: "strict",
        httpOnly: true,
        secure: cookieSecure(),
        path: "/",
      },
    },
  );

  // Validate JWT server-side (NEVER use getSession on backend per CLAUDE.md).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes must respond with JSON envelope (contract: {error:{code,message}})
    // — never redirect HTML to JSON consumers. UI routes redirect to /login as before.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Texto que o banco não guarda (caractere NULO, par Unicode partido) virava
  // 500 no meio da gravação em qualquer rota (schemathesis, 14/11/2026). Só
  // nas rotas de sessão — as públicas (webhooks, bearer) decidem por si e não
  // podem perder um evento de fora por causa desta guarda.
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase()) &&
    (request.headers.get("content-type") ?? "").toLowerCase().includes("application/json") &&
    Number(request.headers.get("content-length") ?? "0") <= MAX_CORPO_CONFERIDO
  ) {
    const corpo = await request.clone().text().catch(() => "");
    const motivo = corpo.length <= MAX_CORPO_CONFERIDO ? motivoDeRecusaDoJson(corpo) : null;
    if (motivo) {
      return recusa(
        422,
        "validation_failed",
        "O texto enviado tem um caractere que não pode ser guardado (nulo ou Unicode incompleto).",
        { "x-request-id": requestId },
      );
    }
  }

  // EPIC-11 S-11.07: validate impersonate cookie on /app/* paths. Middleware
  // runs in Edge — no DB access, only HMAC + expiry. On any failure we delete
  // the presentation cookie. The database support session remains authoritative:
  // expired/revoked support still blocks the app until explicit exit.
  if (pathname.startsWith("/app")) {
    const impCookie = request.cookies.get(IMPERSONATE_COOKIE_NAME_EDGE)?.value;
    if (impCookie) {
      const result = await verifyImpersonateCookieEdge(
        impCookie,
        env.IMPERSONATE_COOKIE_SECRET ?? "",
      );
      if (!result.valid) {
        console.warn(
          `[middleware] impersonate cookie invalid (${result.reason ?? "unknown"}) — clearing`,
        );
        response.cookies.delete(IMPERSONATE_COOKIE_NAME_EDGE);
      }
    }
  }

  // /admin/* additionally requires platform_admin (early gate — authoritative
  // check is server-side in `requirePlatformAdmin`). Skip the RPC for
  // `/admin/forbidden` (rendered to non-admins, would otherwise loop).
  if (isAdminSurface && pathname.startsWith("/admin") && pathname !== "/admin/forbidden") {
    const { data: isAdmin, error } = await supabase.rpc("fn_is_platform_admin");
    if (error || !isAdmin) {
      return NextResponse.redirect(new URL("/admin/forbidden", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets / Next internals.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
