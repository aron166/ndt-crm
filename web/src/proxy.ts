import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/");
  // Service-to-service ingestion endpoints authenticate with a service-role
  // Bearer key (validated in-route), not a session cookie. Without this bypass
  // the session gate redirects their callers to /login, so external apps
  // (VeloQuote, agents, BirdsView webhooks) can never reach them. The cron
  // endpoint likewise self-authenticates with CRON_SECRET, not a session.
  const isServiceApi =
    request.nextUrl.pathname === "/api/events" ||
    request.nextUrl.pathname === "/api/conversations" ||
    request.nextUrl.pathname === "/api/leads" ||
    request.nextUrl.pathname === "/api/cron/automations";

  if (!user && !isLoginPage && !isAuthRoute && !isServiceApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
