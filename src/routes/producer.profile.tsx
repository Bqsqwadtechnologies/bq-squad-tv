import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Image as ImageIcon, Save, ExternalLink, Loader2, BadgeCheck } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleWelcomeBanner, ConsoleCard } from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

type ProducerProfile = {
  uid: string;
  publicId: string | null;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarPath?: string | null;
  bannerPath?: string | null;
  brandOverlayText?: string;
  brandOverlayLogoPath?: string | null;
  brandOverlayLogoUrl?: string | null;
  followerCount: number;
  verificationStatus: string;
  publicVerificationStatus?: string;
  publicVerificationUntil?: string | null;
  planStatus: string;
  externalLinks: Array<{ title: string; url: string }>;
};

type BlueTickData = {
  enabled: boolean;
  monthlyPriceMinor: number;
  currency: string;
  verificationStatus: string;
  blueVerified: boolean;
  expiresAt: string | null;
};

export const Route = createFileRoute("/producer/profile")({
  component: ProducerProfileRoute,
  head: () => ({
    meta: [
      { title: "Public Profile | Producer Console | BQ SQWAD TV" },
      { name: "description", content: "Edit your public producer name, username, profile photo and cover photo." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProducerProfileRoute() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account, onLock }) => (
        <ProducerProfileContent token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ProducerProfileContent({ token, account, onLock }: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [profile, setProfile] = useState<ProducerProfile | null>(null);
  const [blueTick, setBlueTick] = useState<BlueTickData | null>(null);
  const [blueTickBusy, setBlueTickBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [brandOverlayLogoPath, setBrandOverlayLogoPath] = useState<string | null>(null);
  const [brandOverlayText, setBrandOverlayText] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [brandOverlayPreview, setBrandOverlayPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | "watermark" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const [response, blueTickResponse] = await Promise.all([
        fetch("/api/public/v1/producer/profile", { headers, cache: "no-store" }),
        fetch("/api/public/v1/producer/blue-verification", { headers, cache: "no-store" }),
      ]);
      const data = await response.json() as { profile?: ProducerProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Your producer profile could not be loaded.");
      if (blueTickResponse.ok) setBlueTick(await blueTickResponse.json() as BlueTickData);
      setProfile(data.profile);
      setDisplayName(data.profile.name || "");
      setSlug(data.profile.slug || "");
      setBio(data.profile.bio || "");
      setAvatarPath(data.profile.avatarPath || null);
      setBannerPath(data.profile.bannerPath || null);
      setBrandOverlayLogoPath(data.profile.brandOverlayLogoPath || null);
      setBrandOverlayText(data.profile.brandOverlayText || "");
      setAvatarPreview(data.profile.avatarUrl || null);
      setBannerPreview(data.profile.bannerUrl || null);
      setBrandOverlayPreview(data.profile.brandOverlayLogoUrl || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("blueTick") !== "verify") return;
    const reference = params.get("reference") || params.get("trxref") || "";
    if (!reference) {
      setError("The payment return did not include a transaction reference.");
      return;
    }
    let active = true;
    void (async () => {
      setBlueTickBusy(true);
      try {
        const response = await fetch("/api/public/v1/payments/paystack/verify", {
          method: "POST",
          headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const data = await response.json() as { error?: string; message?: string; blueVerified?: boolean };
        if (!response.ok || data.blueVerified !== true) throw new Error(data.message || data.error || "The public verification payment could not be confirmed.");
        if (active) setNotice("Payment confirmed. Your public blue tick is now active for one month.");
        await loadProfile();
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The payment could not be verified.");
      } finally {
        if (active) {
          setBlueTickBusy(false);
          params.delete("blueTick");
          params.delete("reference");
          params.delete("trxref");
          window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
        }
      }
    })();
    return () => { active = false; };
  }, [token, loadProfile]);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, kind: "avatar" | "banner" | "watermark") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size < 1 || file.size > 8 * 1024 * 1024) {
      setError("Images must be 8 MB or smaller.");
      event.target.value = "";
      return;
    }
    setUploading(kind);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/public/v1/producer/profile-media", {
        method: "POST",
        headers: await getWebAuthHeaders(token),
        body: form,
      });
      const data = await response.json() as { path?: string; previewUrl?: string; error?: string };
      if (!response.ok || !data.path || !data.previewUrl) throw new Error(data.error || "The image could not be uploaded.");
      if (kind === "avatar") {
        setAvatarPath(data.path);
        setAvatarPreview(data.previewUrl);
      } else if (kind === "banner") {
        setBannerPath(data.path);
        setBannerPreview(data.previewUrl);
      } else {
        setBrandOverlayLogoPath(data.path);
        setBrandOverlayPreview(data.previewUrl);
      }
      setNotice(kind === "avatar" ? "Profile photo uploaded. Save your profile to publish it." : kind === "banner" ? "Cover photo uploaded. Save your profile to publish it." : "Producer watermark logo uploaded. Save your profile to publish it.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be uploaded.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  }

  async function purchaseBlueTick() {
    setBlueTickBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/public/v1/producer/blue-verification", {
        method: "POST",
        headers: await getWebAuthHeaders(token),
      });
      const data = await response.json() as { authorizationUrl?: string; error?: string; message?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.message || data.error || "Could not start public verification checkout.");
      window.location.assign(data.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start public verification checkout.");
      setBlueTickBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !slug.trim()) {
      setError("Enter a public producer name and username.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/public/v1/producer/profile", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          slug: slug.trim().toLowerCase(),
          bio: bio.trim(),
          avatarPath,
          bannerPath,
          brandOverlayText: brandOverlayText.trim(),
          brandOverlayLogoPath,
        }),
      });
      const data = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !data.success) throw new Error(data.message || data.error || "Your profile could not be saved.");
      setNotice("Your public producer profile has been saved.");
      await loadProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleShell
      consoleType="producer"
      title="Public Producer Profile"
      tagline="Manage the name, username, profile photo and cover image viewers see"
      activePath="/producer/profile"
      account={account}
      onLock={onLock}
    >
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <ConsoleWelcomeBanner
          title="Your public creator identity"
          description="Your unique username gives viewers a stable way to find and follow your producer page."
          badgeText="Producer Profile"
        />
        {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</div>}
        <form onSubmit={saveProfile} className="space-y-6">
          <ConsoleCard title="Profile and cover photos" description="Upload a clear profile image and a wide cover image. JPEG, PNG and WebP are supported, up to 8 MB each.">
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
                {bannerPreview ? <img src={bannerPreview} alt="Producer cover preview" className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center text-sm text-muted-foreground"><ImageIcon className="mr-2 h-5 w-5" /> Cover photo preview</div>}
                <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-background/90 px-3 py-2 text-xs font-bold text-foreground shadow">
                  {uploading === "banner" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Change cover
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading !== null} onChange={(event) => void uploadImage(event, "banner")} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-border bg-muted">
                  {avatarPreview ? <img src={avatarPreview} alt="Producer profile preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Camera className="h-7 w-7" /></div>}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-card-foreground hover:bg-muted">
                  {uploading === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Upload profile photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading !== null} onChange={(event) => void uploadImage(event, "avatar")} />
                </label>
              </div>
            </div>
          </ConsoleCard>
          <ConsoleCard title="Optional video watermark" description="Your producer logo or short name can appear transparently at the top-right of your BQ SQWAD TV player videos. This is a visible attribution overlay, not copy-protection or DRM.">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-2">
                {brandOverlayPreview ? <img src={brandOverlayPreview} alt="Producer watermark logo preview" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">Logo preview</span>}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-card-foreground hover:bg-muted">
                {uploading === "watermark" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                Upload optional logo
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading !== null} onChange={(event) => void uploadImage(event, "watermark")} />
              </label>
            </div>
            <label className="mt-4 grid gap-1.5 text-xs font-semibold">Optional brand name
              <input value={brandOverlayText} onChange={(event) => setBrandOverlayText(event.target.value)} maxLength={32} placeholder="Your studio or producer name" className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" />
              <span className="font-normal text-muted-foreground">Leave both fields empty to disable your producer overlay.</span>
            </label>
          </ConsoleCard>
          <ConsoleCard title="Public details" description="These details appear on your public producer page.">
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-xs font-semibold">Producer display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">Unique username
                <div className="flex items-center rounded-xl border border-input bg-background px-3">
                  <span className="text-sm text-muted-foreground">@</span>
                  <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={50} className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-foreground outline-none" />
                </div>
                <span className="font-normal text-muted-foreground">Your public page: /p/{slug || profile?.slug || "your-username"}</span>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold">About your production brand
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={2000} rows={5} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Tell viewers about your studio, productions and the stories you create." />
              </label>
            </div>
          </ConsoleCard>
          <ConsoleCard title="Public blue tick" description="An optional monthly public-verification badge. This is separate from your identity approval and does not replace producer KYC.">
            {blueTick?.blueVerified ? (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
                <p className="font-bold text-blue-600">Your public blue tick is active.</p>
                <p className="mt-1 text-xs text-muted-foreground">Valid until {blueTick.expiresAt ? new Date(blueTick.expiresAt).toLocaleDateString() : "the expiry date shown in your account"}.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-card-foreground">{blueTick?.enabled ? "Monthly public verification" : "Public verification is not yet available"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {blueTick?.enabled
                      ? "Price: " + new Intl.NumberFormat("en", { style: "currency", currency: blueTick.currency }).format(blueTick.monthlyPriceMinor / (blueTick.currency === "XOF" ? 1 : 100)) + " per 30 days."
                      : "The platform owner has not enabled public verification pricing yet."}
                  </p>
                </div>
                <button type="button" onClick={() => void purchaseBlueTick()} disabled={!blueTick?.enabled || profile.verificationStatus !== "APPROVED" || blueTickBusy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {blueTickBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  {profile.verificationStatus !== "APPROVED" ? "Identity approval required" : "Get blue tick"}
                </button>
              </div>
            )}
          </ConsoleCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {profile?.slug && <a href={`/p/${profile.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ExternalLink className="h-4 w-4" /> View public profile</a>}
            <button type="submit" disabled={loading || saving || uploading !== null} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
            </button>
          </div>
        </form>
        {profile && <p className="text-xs text-muted-foreground"><BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> Verification status: {profile.verificationStatus}. Approval is managed by BQ SQWAD TV review.</p>}
      </div>
    </ConsoleShell>
  );
}
