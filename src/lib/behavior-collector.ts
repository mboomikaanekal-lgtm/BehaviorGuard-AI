import type { TelemetryFeatures } from "@/lib/types";

// Aggregates behavioral biometric signals from the protected workspace.
// Collects ONLY aggregate statistics — never raw key values, typed text,
// passwords, or form contents. Keystroke timing is captured as inter-key
// intervals with no regard to which key was pressed.

interface MouseSample {
  t: number;
  x: number;
  y: number;
}

interface ScrollSample {
  t: number;
  y: number;
}

interface KeystrokeSample {
  t: number;
}

export class BehaviorCollector {
  private mouseSamples: MouseSample[] = [];
  private scrollSamples: ScrollSample[] = [];
  private keystrokeSamples: KeystrokeSample[] = [];
  private navTransitions = 0;
  private expectedNavTransitions = 0;
  private windowStart = 0;
  private lastKeyTime = 0;
  private handlers: { [k: string]: EventListenerOrEventListenerObject } = {};

  start() {
    this.mouseSamples = [];
    this.scrollSamples = [];
    this.keystrokeSamples = [];
    this.navTransitions = 0;
    this.expectedNavTransitions = 0;
    this.windowStart = performance.now();
    this.lastKeyTime = 0;

    const mouseHandler = (e: Event) => {
      const me = e as MouseEvent;
      this.mouseSamples.push({ t: performance.now(), x: me.clientX, y: me.clientY });
      if (this.mouseSamples.length > 500) this.mouseSamples.shift();
    };
    const scrollHandler = () => {
      this.scrollSamples.push({ t: performance.now(), y: window.scrollY });
      if (this.scrollSamples.length > 300) this.scrollSamples.shift();
    };
    const keyHandler = () => {
      const now = performance.now();
      if (this.lastKeyTime > 0) {
        this.keystrokeSamples.push({ t: now - this.lastKeyTime });
        if (this.keystrokeSamples.length > 200) this.keystrokeSamples.shift();
      }
      this.lastKeyTime = now;
    };

    this.handlers = {
      mousemove: mouseHandler,
      scroll: scrollHandler,
      keydown: keyHandler,
    };

    window.addEventListener("mousemove", mouseHandler);
    window.addEventListener("scroll", scrollHandler, { passive: true });
    window.addEventListener("keydown", keyHandler);
  }

  recordNavTransition(expected: boolean) {
    this.navTransitions++;
    if (expected) this.expectedNavTransitions++;
  }

  private mean(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  private std(arr: number[], m?: number): number {
    if (arr.length < 2) return 0;
    const mu = m ?? this.mean(arr);
    const variance = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  // Computes the features for the current window. `durationMs` is the elapsed
  // window time; idleRatio is derived from active event coverage.
  computeFeatures(durationMs?: number): TelemetryFeatures {
    const dur = durationMs ?? (performance.now() - this.windowStart);

    // Mouse speed (px/s) between consecutive samples
    const mouseSpeeds: number[] = [];
    for (let i = 1; i < this.mouseSamples.length; i++) {
      const a = this.mouseSamples[i - 1];
      const b = this.mouseSamples[i];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        mouseSpeeds.push(dist / dt);
      }
    }
    // Mouse curvature: average ratio of displacement to path length
    // (1 = perfectly straight, lower = more curved)
    let curvSum = 0;
    let curvCount = 0;
    for (let i = 2; i < this.mouseSamples.length; i++) {
      const a = this.mouseSamples[i - 2];
      const b = this.mouseSamples[i - 1];
      const c = this.mouseSamples[i];
      const pathLen = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y);
      const disp = Math.hypot(c.x - a.x, c.y - a.y);
      if (pathLen > 0) {
        curvSum += disp / pathLen;
        curvCount++;
      }
    }
    const mouseCurvature = curvCount > 0 ? curvSum / curvCount : 0.8;

    // Scroll speed (px/s)
    const scrollSpeeds: number[] = [];
    for (let i = 1; i < this.scrollSamples.length; i++) {
      const a = this.scrollSamples[i - 1];
      const b = this.scrollSamples[i];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) scrollSpeeds.push(Math.abs(b.y - a.y) / dt);
    }

    // Keystroke inter-key intervals (ms)
    const ksIntervals = this.keystrokeSamples.map((s) => s.t);

    // Nav flow deviation
    const navFlowDeviation = this.navTransitions > 0
      ? 1 - this.expectedNavTransitions / this.navTransitions
      : 0;

    // Active time = time span with events; idle = dur - active
    const eventTimes = [
      ...this.mouseSamples.map((s) => s.t),
      ...this.scrollSamples.map((s) => s.t),
    ];
    let activeMs = 0;
    if (eventTimes.length > 1) {
      const sorted = [...eventTimes].sort((a, b) => a - b);
      activeMs = sorted[sorted.length - 1] - sorted[0];
    }
    const idleRatio = dur > 0 ? Math.max(0, 1 - activeMs / dur) : 1;

    const event_count = this.mouseSamples.length + this.scrollSamples.length + this.keystrokeSamples.length;

    return {
      mouse_speed_mean: Math.round(this.mean(mouseSpeeds)),
      mouse_speed_std: Math.round(this.std(mouseSpeeds)),
      mouse_curvature: Math.round(mouseCurvature * 100) / 100,
      scroll_speed_mean: Math.round(this.mean(scrollSpeeds)),
      scroll_speed_std: Math.round(this.std(scrollSpeeds)),
      nav_flow_deviation: Math.round(navFlowDeviation * 100) / 100,
      keystroke_timing_mean: Math.round(this.mean(ksIntervals)),
      keystroke_timing_std: Math.round(this.std(ksIntervals)),
      idle_ratio: Math.round(idleRatio * 100) / 100,
      event_count,
    };
  }

  stop() {
    Object.entries(this.handlers).forEach(([event, handler]) => {
      window.removeEventListener(event, handler);
    });
    this.handlers = {};
  }

  // Generates deterministic synthetic anomalous features for takeover simulation.
  // These represent a hypothetical attacker with very different behavioral patterns.
  static simulatedTakeoverFeatures(): TelemetryFeatures {
    return {
      mouse_speed_mean: 1450,   // very fast, robotic
      mouse_speed_std: 12,      // unnaturally consistent
      mouse_curvature: 0.98,    // almost perfectly straight lines
      scroll_speed_mean: 3200,  // rapid scrolling
      scroll_speed_std: 8,
      nav_flow_deviation: 0.85, // jumping around unexpectedly
      keystroke_timing_mean: 65,// very fast typing
      keystroke_timing_std: 5,  // unnaturally uniform
      idle_ratio: 0.01,         // no pauses at all
      event_count: 180,
    };
  }
}
