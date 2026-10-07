"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, CircleDashed, Loader2, Mic, Monitor, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { browserCapabilities, mediaErrorMessage, summarize, type Capability } from "@/lib/environment-checks";
import { saveEnvironmentCheck } from "@/lib/setup-actions";

type State = "idle" | "running" | "pass" | "fail";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The environment check, for real: it opens the camera and shows what it
 * sees, opens the microphone and shows the level it hears, and asks the
 * browser for each thing the workspace uses.
 *
 * Nothing from the camera or microphone leaves the page — the preview and
 * the level meter are drawn locally, and both devices are released when the
 * check ends. What is saved afterwards is three yes/no answers and the
 * browser's name.
 */
export function EnvironmentCheck({ lastPassedAt }: { lastPassedAt: string | null }) {
  const [camera, setCamera] = useState<State>("idle");
  const [cameraNote, setCameraNote] = useState("");
  const [mic, setMic] = useState<State>("idle");
  const [micNote, setMicNote] = useState("");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [saved, setSaved] = useState<"" | "saving" | "passed" | "not-passed" | "unsaved">("");
  const [running, setRunning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streams = useRef<MediaStream[]>([]);
  const audio = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  function release() {
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    if (audio.current) {
      cancelAnimationFrame(audio.current.raf);
      void audio.current.ctx.close().catch(() => undefined);
      audio.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setLevel(0);
  }
  // Never leave a camera light on behind a page the candidate has left.
  useEffect(() => release, []);

  async function run() {
    release();
    setRunning(true);
    setSaved("");
    setHeard(false);

    const caps = browserCapabilities(window);
    setCapabilities(caps);
    const browser = summarize(caps);

    // Camera: a live video track, shown back to the candidate.
    let cameraOk = false;
    setCamera("running");
    setCameraNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streams.current.push(stream);
      const track = stream.getVideoTracks()[0];
      cameraOk = !!track && track.readyState === "live";
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamera(cameraOk ? "pass" : "fail");
      setCameraNote(cameraOk ? track.label || "Camera is working" : "The camera opened but isn't sending video.");
    } catch (err) {
      setCamera("fail");
      setCameraNote(mediaErrorMessage("camera", err));
    }

    // Microphone: a live audio track, and a meter so they can see it hears them.
    let micOk = false;
    setMic("running");
    setMicNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.current.push(stream);
      const track = stream.getAudioTracks()[0];
      micOk = !!track && track.readyState === "live";
      setMic(micOk ? "pass" : "fail");
      setMicNote(micOk ? track.label || "Microphone is working" : "The microphone opened but isn't sending audio.");
      if (micOk) {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel(peak);
          if (peak > 0.08) setHeard(true);
          if (audio.current) audio.current.raf = requestAnimationFrame(tick);
        };
        audio.current = { ctx, raf: requestAnimationFrame(tick) };
      }
    } catch (err) {
      setMic("fail");
      setMicNote(mediaErrorMessage("microphone", err));
    }

    setRunning(false);
    setSaved("saving");
    const result = await saveEnvironmentCheck({
      camera: cameraOk,
      microphone: micOk,
      browser: browser.passed,
      missing: browser.missing,
      userAgent: navigator.userAgent,
    }).catch(() => ({ ok: false, passed: false }));
    setSaved(!result.ok ? "unsaved" : result.passed ? "passed" : "not-passed");
  }

  const browser = capabilities ? summarize(capabilities) : null;
  const browserState: State = !capabilities ? "idle" : browser!.passed ? "pass" : "fail";

  return (
    <div>
      <div className="mt-8 space-y-4">
        <Row icon={<Camera size={20} />} title="Camera" state={camera} note={cameraNote || "Opens your camera and shows you the picture. A session keeps it on."}>
          <video
            ref={videoRef}
            muted
            playsInline
            className={camera === "pass" ? "mt-3 aspect-video w-full max-w-xs rounded-lg bg-black object-cover" : "hidden"}
          />
        </Row>

        <Row icon={<Mic size={20} />} title="Microphone" state={mic} note={micNote || "Opens your microphone and shows the level it hears. Used if you take the interview by voice."}>
          {mic === "pass" && (
            <div className="mt-3 max-w-xs">
              <div className="h-2 overflow-hidden rounded-full bg-[#B3CFE5]/40">
                <div className="h-full rounded-full bg-[#1A9E6B] transition-[width] duration-75" style={{ width: `${Math.min(100, Math.round(level * 160))}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] text-[#4A7FA7]">
                {heard ? "It heard you." : "Say something — the bar should move. If it stays flat, the wrong microphone may be selected."}
              </p>
            </div>
          )}
        </Row>

        <Row
          icon={<Monitor size={20} />}
          title="Browser"
          state={browserState}
          note={
            !capabilities
              ? "Asks your browser for each thing the workspace uses."
              : browser!.passed
                ? "Your browser has everything the workspace uses."
                : `Missing: ${browser!.missing.join(", ")}. A current Chrome, Edge or Firefox has all of these.`
          }
        >
          {capabilities && (
            <ul className="mt-3 space-y-1">
              {capabilities.map((c) => (
                <li key={c.name} className="flex items-start gap-2 text-[12.5px]">
                  {c.ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#1A9E6B]" />
                  ) : c.required ? (
                    <XCircle size={14} className="mt-0.5 shrink-0 text-[#a6203c]" />
                  ) : (
                    <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[#C26410]" />
                  )}
                  <span className="text-[#0A1931]">
                    {c.name} <span className="text-[#4A7FA7]">— {c.why}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Row>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void run()} disabled={running}>
          {running ? "Checking…" : capabilities ? "Run it again" : "Start the check"}
        </Button>
        {(camera === "pass" || mic === "pass") && !running && (
          <button type="button" onClick={release} className="text-[13px] font-medium text-[#4A7FA7] hover:text-[#1A3D63] hover:underline">
            Turn the camera and microphone off
          </button>
        )}
      </div>

      <p role="status" className="mt-4 text-[13px] leading-relaxed text-[#1A3D63]">
        {saved === "saving" && "Saving the result…"}
        {saved === "passed" && "All three passed. This step is ticked off on your dashboard."}
        {saved === "not-passed" && "Not everything passed yet. Fix what's marked above and run it again — nothing is held against you for trying."}
        {saved === "unsaved" && "The check ran, but the result couldn't be saved. Run it again in a moment."}
        {saved === "" && lastPassedAt && `You last passed this check on ${day(lastPassedAt)}. Run it again if you've changed browser, camera or computer since.`}
      </p>

      <p className="mt-6 max-w-lg text-[12px] leading-relaxed text-[#4A7FA7]">
        Nothing from your camera or microphone leaves this page during the check — the picture and the level are drawn here, in your
        browser. Only whether each part passed, and your browser&apos;s name, are saved.
      </p>
    </div>
  );
}

function Row({ icon, title, state, note, children }: { icon: React.ReactNode; title: string; state: State; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-[#B3CFE5] bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B3CFE5]/30 text-[#1A3D63]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium text-[#0A1931]">{title}</p>
          {state === "idle" && <CircleDashed size={15} className="text-[#B3CFE5]" aria-label="Not checked yet" />}
          {state === "running" && <Loader2 size={15} className="animate-spin text-[#4A7FA7]" aria-label="Checking" />}
          {state === "pass" && <CheckCircle2 size={15} className="text-[#1A9E6B]" aria-label="Passed" />}
          {state === "fail" && <XCircle size={15} className="text-[#a6203c]" aria-label="Failed" />}
        </div>
        <p className={state === "fail" ? "mt-0.5 text-[12.5px] text-[#a6203c]" : "mt-0.5 text-[12.5px] text-[#4A7FA7]"}>{note}</p>
        {children}
      </div>
    </div>
  );
}
