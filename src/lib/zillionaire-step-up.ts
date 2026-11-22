import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

export type ZillionaireStepUpScope =
  | "wallet_adjust"
  | "payment_reversal"
  | "permanent_delete"
  | "team_manage"
  | "payout_settlement";

export async function requestZillionaireStepUp(
  scope: ZillionaireStepUpScope,
  reason: string,
): Promise<Headers> {
  if (typeof document === "undefined") {
    throw new Error("Step-up verification requires browser environment.");
  }

  const session = await restoreWebSession();
  if (!session) throw new Error("Sign in to continue.");

  return new Promise<Headers>((resolve, reject) => {
    // Container overlay
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150";

    const modal = document.createElement("div");
    modal.className =
      "w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1435] p-6 shadow-2xl space-y-4 text-white font-sans";

    modal.innerHTML = `
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <h3 class="font-bold text-white text-base">Owner Step-Up Verification</h3>
          <p class="text-xs text-blue-200/60 mt-0.5">High-privilege operation requires credential confirmation</p>
        </div>
        <button id="step-up-close" class="text-blue-200/60 hover:text-white p-1 rounded-lg">✕</button>
      </div>
      <div class="rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-xs text-blue-200">
        <span class="font-semibold text-blue-100">Operation:</span> ${escapeHtml(reason)}
      </div>
      <div id="step-up-error" class="hidden rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300"></div>
      <form id="step-up-form" class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-blue-200/70 mb-1">Owner Access Password</label>
          <input
            id="step-up-password"
            type="password"
            required
            placeholder="Enter password..."
            class="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-blue-200/70 mb-1">Six-Digit Authenticator Code (TOTP)</label>
          <input
            id="step-up-code"
            type="text"
            required
            pattern="[0-9]{6}"
            maxlength="6"
            placeholder="000000"
            class="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white text-center font-mono tracking-widest placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            id="step-up-cancel"
            class="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-blue-200/70 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            id="step-up-submit"
            class="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-400 transition-colors disabled:opacity-50"
          >
            Authorize Step-Up
          </button>
        </div>
      </form>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };

    const closeBtn = modal.querySelector("#step-up-close") as HTMLButtonElement;
    const cancelBtn = modal.querySelector("#step-up-cancel") as HTMLButtonElement;
    const form = modal.querySelector("#step-up-form") as HTMLFormElement;
    const passInput = modal.querySelector("#step-up-password") as HTMLInputElement;
    const codeInput = modal.querySelector("#step-up-code") as HTMLInputElement;
    const errorBox = modal.querySelector("#step-up-error") as HTMLDivElement;
    const submitBtn = modal.querySelector("#step-up-submit") as HTMLButtonElement;

    passInput.focus();

    const handleCancel = () => {
      cleanup();
      reject(new Error("Step-up verification was cancelled."));
    };

    closeBtn.onclick = handleCancel;
    cancelBtn.onclick = handleCancel;

    overlay.onkeydown = (e) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const password = passInput.value;
      const code = codeInput.value.trim();

      if (!password || !code) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying...";
      errorBox.classList.add("hidden");

      try {
        const headers = new Headers(await getWebAuthHeaders(session));
        headers.set("Content-Type", "application/json");

        const response = await fetch("/api/public/v1/zillionaire/access/step-up", {
          method: "POST",
          headers,
          body: JSON.stringify({ password, code, scope, reason }),
        });

        const data = (await response.json()) as { token?: string; message?: string; error?: string };

        if (!response.ok || !data.token) {
          throw new Error(data.message || data.error || "Step-up verification failed.");
        }

        headers.set("x-zillionaire-step-up", data.token);
        cleanup();
        resolve(headers);
      } catch (err: any) {
        errorBox.textContent = err.message || "Step-up verification failed.";
        errorBox.classList.remove("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Authorize Step-Up";
      }
    };
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
