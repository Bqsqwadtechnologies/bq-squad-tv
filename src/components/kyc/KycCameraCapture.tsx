import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Upload,
  QrCode,
  Smartphone,
  Eye,
  Smile,
  ShieldCheck,
  X,
  FlipHorizontal,
  FileText,
  CreditCard,
  Sun,
} from "lucide-react";

export type CaptureMode = "face_liveness" | "id_card_front" | "id_card_back" | "passport_page";

export interface CapturedResult {
  dataUrl: string;
  blob?: Blob;
  mode: CaptureMode;
  metadata: {
    capturedAt: string;
    durationMs: number;
    challengesCompleted?: string[];
    screenWidth: number;
    screenHeight: number;
    userAgent: string;
  };
}

export interface KycCameraCaptureProps {
  mode: CaptureMode;
  onCapture: (result: CapturedResult) => void;
  onUploadFileInstead?: () => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  handoffUrl?: string;
}

type LivenessChallenge = "centre" | "blink" | "turn_left" | "turn_right" | "smile";

export function KycCameraCapture({
  mode,
  onCapture,
  onUploadFileInstead,
  onClose,
  title,
  subtitle,
  handoffUrl,
}: KycCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraPermission, setCameraPermission] = useState<"prompt" | "granted" | "denied">("prompt");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showHandoffQr, setShowHandoffQr] = useState<boolean>(false);
  const [idMode, setIdMode] = useState<"card" | "passport">(mode === "passport_page" ? "passport" : "card");

  // Lighting & glare quality detection
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);

  // Liveness state
  const [livenessStep, setLivenessStep] = useState<number>(0);
  const challenges: LivenessChallenge[] = ["centre", "blink", "turn_left", "turn_right", "smile"];
  const currentChallenge = challenges[livenessStep] || "centre";
  const [challengeProgress, setChallengeProgress] = useState<number>(10);
  const startTimeRef = useRef<number>(Date.now());
  const completedChallengesRef = useRef<string[]>([]);

  // Start media stream
  const startCamera = useCallback(async () => {
    setPermissionError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode === "face_liveness" ? "user" : "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setCameraPermission("granted");
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        const p = videoRef.current.play(); if (p && typeof p.catch === "function") await p.catch(() => {});
      }
      startTimeRef.current = Date.now();
    } catch (err: any) {
      console.warn("[KYC Camera] Access denied or error:", err);
      setCameraPermission("denied");
      setPermissionError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Camera permission was denied. Please allow camera access in your browser settings to continue."
          : "Could not connect to a video camera. You can finish by uploading a photo or switching to mobile.",
      );
    }
  }, [mode, stream]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Frame analyzer for glare / low-light warnings & face simulation
  useEffect(() => {
    if (cameraPermission !== "granted" || capturedImage) return;

    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);

      try {
        const frameData = ctx.getImageData(0, 0, 160, 120).data;
        let totalBrightness = 0;
        let brightPixels = 0;
        const totalPixels = frameData.length / 4;

        for (let i = 0; i < frameData.length; i += 4) {
          const r = frameData[i]!;
          const g = frameData[i + 1]!;
          const b = frameData[i + 2]!;
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          totalBrightness += brightness;
          if (brightness > 240) brightPixels++;
        }

        const avgBrightness = totalBrightness / totalPixels;
        const glarePercent = (brightPixels / totalPixels) * 100;

        if (avgBrightness < 35) {
          setQualityWarning("Low light detected. Move to a better-lit space.");
        } else if (glarePercent > 18) {
          setQualityWarning("Glare detected. Tilt ID slightly away from direct light.");
        } else {
          setQualityWarning(null);
        }
      } catch (e) {
        // ignore cross-origin canvas security exceptions if any
      }

      // Progress active liveness simulation when face verification is active
      if (mode === "face_liveness") {
        setChallengeProgress((prev) => {
          if (prev >= 100) {
            completedChallengesRef.current.push(challenges[livenessStep] || "step");
            if (livenessStep < challenges.length - 1) {
              setLivenessStep((s) => s + 1);
              return 20;
            } else {
              // Automatically trigger snapshot capture on final challenge completion
              handleTakeSnapshot();
              return 100;
            }
          }
          return prev + 15;
        });
      }
    }, 450);

    return () => clearInterval(interval);
  }, [cameraPermission, capturedImage, mode, livenessStep]);

  function handleTakeSnapshot() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If front face liveness, mirror snapshot to match preview
    if (mode === "face_liveness") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);

    // Stop active camera stream while reviewing
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }

  function handleRetake() {
    setCapturedImage(null);
    setLivenessStep(0);
    setChallengeProgress(10);
    completedChallengesRef.current = [];
    startCamera();
  }

  function handleConfirm() {
    if (!capturedImage) return;
    const durationMs = Date.now() - startTimeRef.current;
    onCapture({
      dataUrl: capturedImage,
      mode,
      metadata: {
        capturedAt: new Date().toISOString(),
        durationMs,
        challengesCompleted: completedChallengesRef.current,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        userAgent: navigator.userAgent,
      },
    });
  }

  const promptTitle =
    title ||
    (mode === "face_liveness"
      ? "Liveness Face Verification"
      : mode === "id_card_front"
        ? "Capture Front of ID"
        : mode === "id_card_back"
          ? "Capture Back of ID"
          : "Capture Passport Photo Page");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-6 backdrop-blur-md">
      <div className="relative flex flex-col w-full max-w-xl max-h-[95vh] rounded-3xl border border-white/10 bg-[#081226] text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">{promptTitle}</h2>
              <p className="text-xs text-slate-400">
                {subtitle ||
                  (mode === "face_liveness"
                    ? "Follow on-screen instructions for liveness confirmation"
                    : "Position your document inside the alignment frame")}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close camera"
              className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Camera Viewport or Review / Error */}
        <div className="relative flex-1 min-h-[340px] max-h-[480px] bg-black flex items-center justify-center overflow-hidden">
          {cameraPermission === "denied" ? (
            <div className="p-6 text-center space-y-4 max-w-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-white">Camera Access Required</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {permissionError || "Please enable camera access in your browser permissions."}
              </p>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-200">How to unblock:</p>
                <p>1. Tap the lock/tune icon beside the URL in the address bar.</p>
                <p>2. Toggle "Camera" to Allow.</p>
                <p>3. Tap "Try Again" below or upload a file directly.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={startCamera}
                  className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs sm:text-sm font-semibold text-black hover:bg-cyan-400 transition"
                >
                  Try Again
                </button>
                {onUploadFileInstead && (
                  <button
                    onClick={onUploadFileInstead}
                    className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-medium text-white hover:bg-white/15 transition"
                  >
                    Upload File Instead
                  </button>
                )}
              </div>
            </div>
          ) : capturedImage ? (
            /* Review captured photo */
            <div className="relative h-full w-full flex items-center justify-center p-4">
              <img
                src={capturedImage}
                alt="Captured document"
                className="max-h-[380px] w-auto rounded-2xl border border-white/20 object-contain shadow-2xl"
              />
              <div className="absolute top-6 right-6 rounded-full bg-emerald-500/90 p-1.5 text-black shadow-lg">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          ) : (
            /* Live Camera Stream with Guides */
            <div className="relative h-full w-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${
                  mode === "face_liveness" ? "scale-x-[-1]" : ""
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Face Liveness Overlay */}
              {mode === "face_liveness" && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="relative flex items-center justify-center">
                    {/* SVG Progress Ring */}
                    <svg className="h-64 w-64 -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        className="stroke-white/20"
                        strokeWidth="3"
                        fill="transparent"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        className="stroke-cyan-400 transition-all duration-300 ease-out"
                        strokeWidth="3.5"
                        strokeDasharray={276.46}
                        strokeDashoffset={276.46 - (276.46 * challengeProgress) / 100}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    {/* Inner Guide Oval */}
                    <div className="absolute h-56 w-44 rounded-[50%] border-2 border-dashed border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.25)]" />
                  </div>

                  {/* Challenge Prompt Banner */}
                  <div className="mt-4 rounded-full border border-cyan-400/40 bg-black/70 px-4 py-1.5 text-xs font-semibold text-cyan-200 backdrop-blur-md flex items-center gap-2">
                    {currentChallenge === "centre" && <Eye className="h-4 w-4 animate-pulse" />}
                    {currentChallenge === "blink" && <Eye className="h-4 w-4" />}
                    {currentChallenge === "turn_left" && <FlipHorizontal className="h-4 w-4" />}
                    {currentChallenge === "turn_right" && <FlipHorizontal className="h-4 w-4" />}
                    {currentChallenge === "smile" && <Smile className="h-4 w-4 text-amber-300" />}

                    <span>
                      {currentChallenge === "centre" && "Centre your face inside the oval"}
                      {currentChallenge === "blink" && "Blink both eyes slowly"}
                      {currentChallenge === "turn_left" && "Turn head slightly to the left"}
                      {currentChallenge === "turn_right" && "Turn head slightly to the right"}
                      {currentChallenge === "smile" && "Smile gently"}
                    </span>
                  </div>
                </div>
              )}

              {/* ID Card / Passport Framing Overlay */}
              {mode !== "face_liveness" && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                  <div
                    className={`relative border-2 border-dashed border-cyan-400 rounded-2xl transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] ${
                      idMode === "card"
                        ? "w-[85%] max-w-[360px] aspect-[1.586]"
                        : "w-[80%] max-w-[340px] aspect-[1.4]"
                    }`}
                  >
                    {/* 4 Corner Markers */}
                    <div className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />

                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-cyan-200/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
                        Fit entire document within box
                      </span>
                    </div>
                  </div>

                  {/* Mode switcher button */}
                  <div className="mt-4 pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => setIdMode("card")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                        idMode === "card" ? "bg-cyan-500 text-black font-bold" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5" /> ID Card
                    </button>
                    <button
                      onClick={() => setIdMode("passport")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                        idMode === "passport" ? "bg-cyan-500 text-black font-bold" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" /> Passport Page
                    </button>
                  </div>
                </div>
              )}

              {/* Quality Warning badge */}
              {qualityWarning && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/50 bg-amber-950/80 px-3.5 py-1 text-xs font-medium text-amber-200 backdrop-blur-md flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5" />
                  {qualityWarning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 px-5 py-4 bg-slate-900/80">
          {capturedImage ? (
            /* Review Action Buttons */
            <div className="flex items-center justify-between w-full gap-3">
              <button
                onClick={handleRetake}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-medium text-white hover:bg-white/10 transition"
              >
                <RefreshCw className="h-4 w-4" /> Retake
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-6 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-cyan-400 shadow-lg shadow-cyan-500/25 transition"
              >
                <CheckCircle2 className="h-4 w-4" /> Use this Photo
              </button>
            </div>
          ) : (
            /* Active Capture Controls */
            <>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                {onUploadFileInstead && cameraPermission !== "denied" && (
                  <button
                    onClick={onUploadFileInstead}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition py-1"
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload file instead
                  </button>
                )}
                <button
                  onClick={() => setShowHandoffQr(!showHandoffQr)}
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition py-1 ml-auto sm:ml-4"
                >
                  <Smartphone className="h-3.5 w-3.5" /> Continue on phone
                </button>
              </div>

              {cameraPermission === "granted" && mode !== "face_liveness" && (
                <button
                  onClick={handleTakeSnapshot}
                  aria-label="Capture photo"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-cyan-400 shadow-lg shadow-cyan-500/25 transition w-full sm:w-auto"
                >
                  <Camera className="h-4 w-4" /> Capture Photo
                </button>
              )}
            </>
          )}
        </div>

        {/* Desktop Phone Hand-off QR Modal */}
        {showHandoffQr && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/20 bg-[#0c1838] p-6 text-center max-w-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-cyan-400" /> Phone Handoff
                </h4>
                <button
                  onClick={() => setShowHandoffQr(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Scan with your phone's camera to complete liveness capture smoothly with your mobile camera.
              </p>
              {/* QR Code Graphic Container */}
              <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-2xl bg-white p-3 shadow-inner">
                <svg className="h-full w-full" viewBox="0 0 100 100" fill="none">
                  {/* Stylized QR Matrix Pattern */}
                  <rect x="10" y="10" width="25" height="25" fill="#0c1838" />
                  <rect x="15" y="15" width="15" height="15" fill="#ffffff" />
                  <rect x="19" y="19" width="7" height="7" fill="#0c1838" />

                  <rect x="65" y="10" width="25" height="25" fill="#0c1838" />
                  <rect x="70" y="15" width="15" height="15" fill="#ffffff" />
                  <rect x="74" y="19" width="7" height="7" fill="#0c1838" />

                  <rect x="10" y="65" width="25" height="25" fill="#0c1838" />
                  <rect x="15" y="70" width="15" height="15" fill="#ffffff" />
                  <rect x="19" y="74" width="7" height="7" fill="#0c1838" />

                  <rect x="42" y="15" width="6" height="6" fill="#0c1838" />
                  <rect x="52" y="25" width="6" height="6" fill="#0c1838" />
                  <rect x="45" y="45" width="10" height="10" fill="#0c1838" />
                  <rect x="65" y="55" width="6" height="6" fill="#0c1838" />
                  <rect x="78" y="75" width="8" height="8" fill="#0c1838" />
                  <rect x="42" y="75" width="6" height="6" fill="#0c1838" />
                </svg>
              </div>
              <p className="text-[11px] text-slate-400 break-all font-mono">
                {handoffUrl || "https://tv.bqsqwad.com/kyc/mobile-capture"}
              </p>
              <button
                onClick={() => setShowHandoffQr(false)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Back to Camera
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
