import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Users,
  Film,
  Info,
  MessageSquare,
  Share2,
  ExternalLink,
  Heart,
  Loader2,
  AlertCircle,
  Flag,
  Send,
  Calendar,
  Sparkles,
  ArrowLeft,
  Tv,
  Star,
} from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

interface ProducerData {
  uid: string;
  publicId: string | null;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: Array<{ title: string; url: string }>;
  verified: boolean;
  followerCount: number;
  totalTitles: number;
  joinedAt: string | null;
}

interface TitleItem {
  id: string;
  assetId: string;
  title: string;
  description: string;
  contentType: string;
  category: string;
  genre: string;
  posterUrl: string | null;
  averageStars: number;
  ratingCount: number;
  releaseDate: string | null;
}

interface CommunityComment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  createdAt: string | null;
}

export const Route = createFileRoute("/p/$slug")({
  component: PublicProducerProfilePage,
  head: () => ({
    meta: [
      { title: "Producer Profile | BQ SQWAD TV" },
      { name: "description", content: "Discover movies and series from verified independent producers." },
    ],
  }),
});

function PublicProducerProfilePage() {
  const { slug } = Route.useParams();
  const [producer, setProducer] = useState<ProducerData | null>(null);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"titles" | "about" | "community">("titles");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Comments state
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReasonInput, setReportReasonInput] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const restoredToken = await restoreWebSession();
      if (restoredToken) {
        setToken(restoredToken);
      }
      loadProfile(restoredToken || null);
      loadComments();
    }
    init();
  }, [slug]);

  async function loadProfile(authToken: string | null) {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/public/v1/producers/${slug}`, { headers });
      if (!res.ok) {
        throw new Error("Producer profile not found.");
      }
      const data = await res.json();
      setProducer(data.producer);
      setTitles(data.titles || []);
      setIsFollowing(data.isFollowing || false);
      setIsSelf(data.isSelf || false);
      setFollowerCount(data.producer?.followerCount || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load producer profile.");
    } finally {
      setLoading(false);
    }
  }

  async function loadComments() {
    try {
      const res = await fetch(`/api/public/v1/producers/${slug}/comments/`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch {
      // ignore
    }
  }

  async function handleToggleFollow() {
    if (!token) {
      setActionNotice("Please sign in to follow this producer.");
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }
    setFollowBusy(true);
    try {
      const res = await fetch(`/api/public/v1/producers/${slug}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ following: !isFollowing }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.isFollowing);
        setFollowerCount(data.followerCount);
      }
    } catch {
      // ignore
    } finally {
      setFollowBusy(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setCommentNotice("Please sign in to post a comment.");
      setTimeout(() => setCommentNotice(null), 4000);
      return;
    }
    if (!newComment.trim()) return;

    setCommentBusy(true);
    try {
      const res = await fetch(`/api/public/v1/producers/${slug}/comments/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCommentNotice(data.message || "Your comment was submitted for review.");
        setNewComment("");
      }
    } catch {
      // ignore
    } finally {
      setCommentBusy(false);
    }
  }

  function handleReportComment(commentId: string) {
    if (!token) {
      setActionNotice("Please sign in to report a comment.");
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }
    setReportingCommentId(commentId);
    setReportReasonInput("");
  }

  async function submitReportComment() {
    if (!reportingCommentId || !reportReasonInput.trim()) return;
    setReportSubmitting(true);
    try {
      const res = await fetch(`/api/public/v1/producers/${slug}/comments/${reportingCommentId}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reportReasonInput.trim() }),
      });
      if (res.ok) {
        setReportSuccess("Comment has been reported for moderation review.");
        setReportingCommentId(null);
        setTimeout(() => setReportSuccess(null), 4000);
      }
    } catch {
      // ignore
    } finally {
      setReportSubmitting(false);
    }
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: producer?.name || "Producer on BQ SQWAD TV",
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setActionNotice("Profile link copied to clipboard!");
      setTimeout(() => setActionNotice(null), 3000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !producer) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h1 className="text-xl font-bold">Producer Not Found</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {error || "The requested producer profile does not exist or may have been removed."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Hero Banner */}
      <div className="relative h-48 sm:h-64 lg:h-80 w-full overflow-hidden bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950">
        {producer.bannerUrl && (
          <img
            src={producer.bannerUrl}
            alt={producer.name}
            className="w-full h-full object-cover opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute top-4 left-4 z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/10 text-white text-xs hover:bg-black/60 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Catalog
          </Link>
        </div>
      </div>

      {/* Profile Header Bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative -mt-16 sm:-mt-20 z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 pb-6 border-b border-border">
          {/* Avatar & Details */}
          <div className="flex items-end gap-4">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-4 border-background overflow-hidden bg-card shadow-2xl shrink-0">
              {producer.avatarUrl ? (
                <img
                  src={producer.avatarUrl}
                  alt={producer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-2xl">
                  {producer.name.charAt(0)}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                  {producer.name}
                </h1>
                {producer.verified && (
                  <span
                    title="Verified Producer"
                    className="inline-flex items-center gap-1 text-cyan-400 font-semibold text-xs"
                  >
                    <BadgeCheck className="w-5 h-5 fill-cyan-400 text-background" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                @{producer.slug}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <strong className="text-foreground">{followerCount}</strong> followers
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Film className="w-3.5 h-3.5 text-primary" />
                  <strong className="text-foreground">{producer.totalTitles}</strong> titles
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
            {isSelf ? (
              <Link
                to="/producer"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold hover:bg-muted transition"
              >
                Go to Producer Studio
              </Link>
            ) : (
              <button
                onClick={handleToggleFollow}
                disabled={followBusy}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-sm ${
                  isFollowing
                    ? "bg-muted text-foreground border border-border hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {followBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isFollowing ? (
                  <>
                    <Heart className="w-4 h-4 fill-primary text-primary" />
                    Following
                  </>
                ) : (
                  <>
                    <Heart className="w-4 h-4" />
                    Follow
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl border border-border hover:bg-muted transition text-muted-foreground hover:text-foreground"
              title="Share profile"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bio Preview */}
        {producer.bio && (
          <p className="text-sm text-muted-foreground mt-4 max-w-3xl leading-relaxed">
            {producer.bio}
          </p>
        )}

        {/* Links */}
        {producer.links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {producer.links.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition"
              >
                <ExternalLink className="w-3 h-3" />
                {link.title}
              </a>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border mt-8">
          {[
            { id: "titles", label: `Titles (${titles.length})`, icon: Film },
            { id: "about", label: "About", icon: Info },
            { id: "community", label: `Community (${comments.length})`, icon: MessageSquare },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm border-b-2 transition ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Report Alert Banner */}
        {reportSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            {reportSuccess}
          </div>
        )}

        {/* TAB 1: TITLES */}
        {activeTab === "titles" && (
          <div className="pt-6">
            {titles.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card">
                <Film className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <h3 className="font-semibold text-base">No Published Titles Yet</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  This producer hasn't published any movies or series yet. Check back soon!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {titles.map((t) => (
                  <Link
                    key={t.id}
                    to="/content/$assetId"
                    params={{ assetId: t.assetId || t.id }}
                    className="group rounded-xl overflow-hidden border border-border bg-card hover:border-primary/50 transition flex flex-col"
                  >
                    <div className="aspect-[2/3] w-full bg-muted relative overflow-hidden">
                      {t.posterUrl ? (
                        <img
                          src={t.posterUrl}
                          alt={t.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                      <span className="absolute top-2 right-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/70 backdrop-blur text-white">
                        {t.contentType}
                      </span>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition">
                          {t.title}
                        </h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {t.genre} • {t.category}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 mt-2 border-t border-border/50">
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {t.averageStars > 0 ? t.averageStars.toFixed(1) : "New"}
                        </span>
                        {t.releaseDate && (
                          <span>{new Date(t.releaseDate).getFullYear()}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ABOUT */}
        {activeTab === "about" && (
          <div className="pt-6 max-w-3xl space-y-6">
            <div className="p-6 rounded-2xl border border-border bg-card space-y-4">
              <h3 className="font-bold text-base">Biography & Production Background</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {producer.bio || "No biography provided by this producer."}
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-card grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block">Verification State</span>
                <strong className="text-sm text-foreground">
                  {producer.verified ? "Verified Independent Producer" : "Producer"}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Catalog Holdings</span>
                <strong className="text-sm text-foreground">
                  {producer.totalTitles} Published Titles
                </strong>
              </div>
              {producer.publicId && (
                <div>
                  <span className="text-muted-foreground block">Universal Public ID</span>
                  <span className="font-mono text-xs">{producer.publicId}</span>
                </div>
              )}
              {producer.joinedAt && (
                <div>
                  <span className="text-muted-foreground block">Joined Platform</span>
                  <span>{new Date(producer.joinedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: COMMUNITY */}
        {activeTab === "community" && (
          <div className="pt-6 max-w-3xl space-y-6">
            {/* New Comment Box */}
            <form onSubmit={handlePostComment} className="p-4 rounded-2xl border border-border bg-card space-y-3">
              <label className="text-xs font-semibold block">Leave a comment for this producer</label>
              <textarea
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={token ? "Write your thoughts or words of encouragement..." : "Sign in to post a comment"}
                disabled={!token || commentBusy}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!token || commentBusy || !newComment.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {commentBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Post Comment
                </button>
              </div>
            </form>

            {commentNotice && <p role="status" className="text-xs text-emerald-500">{commentNotice}</p>}
            {/* Comments Stream */}
            <div className="space-y-3">
              {comments.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card text-xs text-muted-foreground">
                  No comments yet. Be the first to start the conversation!
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {c.authorName.charAt(0)}
                        </div>
                        <span className="font-semibold text-xs">{c.authorName}</span>
                        {c.createdAt && (
                          <span className="text-[11px] text-muted-foreground">
                            • {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleReportComment(c.id)}
                        className="text-muted-foreground/60 hover:text-rose-500 transition text-[11px] flex items-center gap-1"
                        title="Report inappropriate content"
                      >
                        <Flag className="w-3 h-3" />
                        Report
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-9">
                      {c.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
            {actionNotice}
          </div>
        )}

        {/* Report Comment Dialog Modal */}
        {reportingCommentId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h3 className="font-bold text-foreground text-sm">Report Inappropriate Comment</h3>
                <button onClick={() => setReportingCommentId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Please provide a brief reason explaining how this comment violates community guidelines:
                </p>
                <textarea
                  value={reportReasonInput}
                  onChange={(e) => setReportReasonInput(e.target.value)}
                  placeholder="e.g. Harassment, spam, hate speech, or spoiler..."
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setReportingCommentId(null)}
                    className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitReportComment}
                    disabled={reportSubmitting || !reportReasonInput.trim()}
                    className="rounded-xl bg-destructive px-3.5 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {reportSubmitting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
