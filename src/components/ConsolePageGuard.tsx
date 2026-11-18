import { useEffect, useState, type ReactNode } from "react";
import { restoreWebSession, getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { NotFoundView } from "@/components/NotFoundView";

export type ConsoleRole = "admin" | "producer" | "provider";

export type ConsoleAccount = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  roles: string[];
  isOwner: boolean;
  modules: string[];
  producerPlanActive?: boolean;
  providerId?: string | null;
};

export interface ConsolePageGuardProps {
  role: ConsoleRole;
  module?: string;
  children: ReactNode | ((props: { token: string; account: ConsoleAccount }) => ReactNode);
}

export function ConsolePageGuard({ role, module: requiredModule, children }: ConsolePageGuardProps) {
  const [state, setState] = useState<
    | { status: "checking" }
    | { status: "denied" }
    | { status: "authorized"; token: string; account: ConsoleAccount }
  >({ status: "checking" });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          if (active) setState({ status: "denied" });
          return;
        }

        const headers = await getWebAuthHeaders(token);
        const response = await fetch("/api/public/v1/auth/web/me", {
          headers,
          cache: "no-store",
        });

        if (!response.ok) {
          if (active) setState({ status: "denied" });
          return;
        }

        const account = (await response.json()) as ConsoleAccount;
        let authorized = false;

        if (role === "admin") {
          if (account.isOwner) {
            authorized = true;
          } else if (Array.isArray(account.modules) && account.modules.length > 0) {
            if (requiredModule) {
              authorized = account.modules.includes(requiredModule);
            } else {
              authorized = true;
            }
          }
        } else if (role === "producer") {
          authorized = Boolean(
            Array.isArray(account.roles) &&
            account.roles.includes("producer") &&
            account.producerPlanActive !== false
          );
        } else if (role === "provider") {
          authorized = Boolean(
            Array.isArray(account.roles) &&
            account.roles.includes("provider") &&
            Boolean(account.providerId)
          );
        }

        if (active) {
          setState(authorized ? { status: "authorized", token, account } : { status: "denied" });
        }
      } catch {
        if (active) setState({ status: "denied" });
      }
    })();

    return () => {
      active = false;
    };
  }, [role, requiredModule]);

  // 1. Tiny neutral shell while checking
  if (state.status === "checking") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy="true"
        data-testid="console-loading-shell"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // 2. Denied: Plain "page not found" screen (same layout, status and text as an unknown address, no hint that a console exists)
  if (state.status === "denied") {
    return <NotFoundView />;
  }

  // 3. Authorized: render the console
  if (typeof children === "function") {
    return <>{children({ token: state.token, account: state.account })}</>;
  }

  return <>{children}</>;
}
