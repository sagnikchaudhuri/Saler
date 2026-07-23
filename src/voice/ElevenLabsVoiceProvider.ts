import { VoiceProviderError } from './errors';
import type {
  VoiceProvider,
  VoiceSpeakOptions,
  VoiceState,
  VoiceStateListener,
} from './types';

// ---------------------------------------------------------------------------
// Injectable browser seams so the provider is testable without real audio.
// ---------------------------------------------------------------------------

export interface AudioElementLike {
  src: string;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface ElevenLabsDeps {
  fetchImpl?: typeof fetch;
  createAudio?: (src: string) => AudioElementLike;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  endpoint?: string;
  timeoutMs?: number;
}

function defaultCreateAudio(src: string): AudioElementLike {
  const audio = new Audio(src);
  return audio as unknown as AudioElementLike;
}

/**
 * Premium voice via our own secure endpoint.
 *
 * It NEVER sees an API key — it posts text to `/api/speak`, which holds the
 * credential server-side. Non-streaming by design: one request, one audio blob,
 * one playback. Object URLs are always revoked, on every exit path.
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  private readonly listeners = new Set<VoiceStateListener>();
  private state: VoiceState = 'idle';
  private controller: AbortController | null = null;
  private audio: AudioElementLike | null = null;
  private objectUrl: string | null = null;
  /**
   * Set after a configuration/auth failure so we stop calling a route that
   * cannot work — avoids pointless requests and wasted credits.
   */
  private disabledForSession = false;

  private readonly fetchImpl: typeof fetch;
  private readonly createAudio: (src: string) => AudioElementLike;
  private readonly createObjectURL: (blob: Blob) => string;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(deps: ElevenLabsDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
    this.createAudio = deps.createAudio ?? defaultCreateAudio;
    this.createObjectURL = deps.createObjectURL ?? ((b) => URL.createObjectURL(b));
    this.revokeObjectURL = deps.revokeObjectURL ?? ((u) => URL.revokeObjectURL(u));
    this.endpoint = deps.endpoint ?? '/api/speak';
    this.timeoutMs = deps.timeoutMs ?? 20_000;
  }

  getName(): string {
    return 'ElevenLabs Voice';
  }

  isAvailable(): boolean {
    return !this.disabledForSession;
  }

  getState(): VoiceState {
    return this.state;
  }

  subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: VoiceState): void {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  private releaseUrl(): void {
    if (this.objectUrl) {
      try {
        this.revokeObjectURL(this.objectUrl);
      } catch {
        // never let cleanup throw
      }
      this.objectUrl = null;
    }
  }

  private teardownAudio(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      try {
        this.audio.pause();
      } catch {
        // ignore
      }
      this.audio = null;
    }
    this.releaseUrl();
  }

  async speak(text: string, _options: VoiceSpeakOptions = {}): Promise<void> {
    if (this.disabledForSession) {
      throw new VoiceProviderError('ElevenLabs is not configured.', 'configuration');
    }

    // One utterance at a time.
    this.stop();

    this.setState('preparing');
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let blob: Blob;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Disable for the session when the route can never succeed.
        if (response.status === 503) {
          this.disabledForSession = true;
          throw new VoiceProviderError('Voice is not configured.', 'configuration');
        }
        if (response.status === 401 || response.status === 403) {
          this.disabledForSession = true;
          throw new VoiceProviderError('Voice credentials rejected.', 'auth');
        }
        if (response.status === 429) {
          throw new VoiceProviderError('Voice quota or rate limit reached.', 'quota');
        }
        throw new VoiceProviderError('Voice service error.', 'network');
      }

      const type = response.headers.get('content-type') ?? '';
      if (!type.toLowerCase().startsWith('audio/')) {
        throw new VoiceProviderError('Voice response was not audio.', 'invalid-response');
      }

      blob = await response.blob();
      if (blob.size === 0) {
        throw new VoiceProviderError('Voice response was empty.', 'invalid-response');
      }
    } catch (err) {
      clearTimeout(timer);
      this.controller = null;
      if (err instanceof VoiceProviderError) {
        this.setState('error');
        throw err;
      }
      // AbortError from stop() is an intentional cancellation.
      if (controller.signal.aborted) {
        this.setState('stopped');
        throw new VoiceProviderError('Voice cancelled.', 'cancelled');
      }
      this.setState('error');
      throw new VoiceProviderError('Voice request failed.', 'network');
    }
    clearTimeout(timer);
    this.controller = null;

    // Cancelled while the response was being read.
    if (controller.signal.aborted) {
      this.setState('stopped');
      throw new VoiceProviderError('Voice cancelled.', 'cancelled');
    }

    // --- playback ---
    const url = this.createObjectURL(blob);
    this.objectUrl = url;
    const audio = this.createAudio(url);
    this.audio = audio;

    try {
      await audio.play();
    } catch {
      this.teardownAudio();
      this.setState('error');
      // Autoplay policies reject programmatic playback — recoverable via a
      // user gesture, so it gets its own reason.
      throw new VoiceProviderError('Autoplay was blocked.', 'autoplay-blocked');
    }

    this.setState('speaking');

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        this.teardownAudio();
        if (this.state === 'speaking') this.setState('stopped');
        resolve();
      };
      audio.onerror = () => {
        this.teardownAudio();
        this.setState('error');
        reject(new VoiceProviderError('Audio playback failed.', 'playback-failed'));
      };
      // stop() during playback resolves through this hook.
      this.resolvePlayback = () => {
        this.teardownAudio();
        resolve();
      };
    });
    this.resolvePlayback = null;
  }

  /** Set while audio is playing so stop() can settle the pending promise. */
  private resolvePlayback: (() => void) | null = null;

  stop(): void {
    // Cancel an in-flight request.
    if (this.controller) {
      try {
        this.controller.abort();
      } catch {
        // ignore
      }
      this.controller = null;
    }
    const resolve = this.resolvePlayback;
    this.resolvePlayback = null;
    this.teardownAudio();
    if (this.state === 'speaking' || this.state === 'preparing') this.setState('stopped');
    resolve?.();
  }
}
