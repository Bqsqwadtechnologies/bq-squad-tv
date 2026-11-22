import { NotFoundView } from "@/components/NotFoundView";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return <NotFoundView />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Replace these placeholders with the app's name and description when first building the app.
    // Each content route, / included, must still set its own head(). Never add og:image or
    // twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "BQ SQWAD TV — Watch on your terms" },
      {
        name: "description",
        content:
          "Discover live channels, programmes and replays with a transparent pay-as-you-go viewing experience.",
      },
      { name: "author", content: "Bq sqwad technologies" },
      { property: "og:title", content: "BQ SQWAD TV — Watch on your terms" },
      {
        property: "og:description",
        content: "Discover channels, programmes and replays with a transparent viewing experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/brand/bq-sqwad-tv-logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/brand/bq-sqwad-tv-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              const saved = localStorage.getItem("bq-sqwad-theme");
              const mode = saved === "light" ? "light" : "dark";
              document.documentElement.classList.toggle("dark", mode === "dark");
              document.documentElement.classList.toggle("light", mode === "light");
            } catch {}
            `,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showLegalFooter =
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/zillionaire") &&
    !pathname.startsWith("/producer") &&
    !pathname.startsWith("/provider");

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {showLegalFooter ? (
        <footer className="border-t border-border bg-background px-5 py-6 pb-28 sm:pb-8 text-center text-xs text-muted-foreground">
          <nav
            aria-label="Legal and console links"
            className="flex flex-wrap justify-center items-center gap-x-5 gap-y-3"
          >
            <a href="/legal/privacy-policy" className="hover:text-foreground">
              Privacy Policy
            </a>
            <a href="/legal/terms" className="hover:text-foreground">
              Terms
            </a>
            <a href="/help/data-protection" className="hover:text-foreground">
              Data protection & trust
            </a>
            <a href="/legal/cookie" className="hover:text-foreground">
              Cookie notice
            </a>
            <a href="/producer" className="font-semibold text-primary/80 hover:text-primary">
              Producer Console
            </a>
            <a href="mailto:tv@bqsqwad.com" className="hover:text-foreground">
              Contact
            </a>
          </nav>
          <p className="mt-3">© BQ SQWAD TV</p>
        </footer>
      ) : null}
    </QueryClientProvider>
  );
}
