import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export type ServerEnhanceGoal =
  | 'auto'
  | 'cinematic'
  | 'social-punch'
  | 'clean-studio'
  | 'podcast';

export interface VideoFrameSample {
  timeSeconds: number;
  dataBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface VideoAudioStats {
  hasAudio: boolean;
  avgLevel: number;
  peakLevel: number;
  quietRatio: number;
  dynamicRange: number;
}

export interface EnhanceVideoRequest {
  fileName: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  goal: ServerEnhanceGoal;
  customPrompt?: string;
  audioStats: VideoAudioStats;
  frames: VideoFrameSample[];
}

export interface ServerSuggestedClip {
  label: string;
  startTime: number;
  endTime: number;
  reason: string;
}

export interface ServerEnhancePlan {
  visualStyleName: string;
  summary: string;
  notes: string[];
  color: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpen: number;
    denoise: boolean;
    videoFadeIn: number;
    videoFadeOut: number;
  };
  audio: {
    volume: number;
    normalize: boolean;
    voiceEnhance: boolean;
    fadeIn: number;
    fadeOut: number;
  };
  framing: {
    recommendedAspect: 'original' | '9:16' | '1:1' | '4:5' | '16:9';
    recommendedFitMode: 'crop' | 'blur' | 'solid';
    reason: string;
  };
  pacing: {
    recommendedIntervalSeconds: number;
    suggestRemoveSilence: boolean;
    reason: string;
  };
  suggestedClips: ServerSuggestedClip[];
}

export class EnhanceApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'EnhanceApiError';
    this.status = status;
  }
}

const VALID_GOALS = new Set<ServerEnhanceGoal>([
  'auto',
  'cinematic',
  'social-punch',
  'clean-studio',
  'podcast',
]);

const VALID_ASPECTS = new Set(['original', '9:16', '1:1', '4:5', '16:9']);
const VALID_FIT_MODES = new Set(['crop', 'blur', 'solid']);
const VALID_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function validateRequest(body: unknown): EnhanceVideoRequest {
  if (!body || typeof body !== 'object') {
    throw new EnhanceApiError(400, 'Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const duration = Number(raw.duration);
  const width = Number(raw.width);
  const height = Number(raw.height);
  const fps = Number(raw.fps ?? 30);
  const goal = (typeof raw.goal === 'string' ? raw.goal : 'auto') as ServerEnhanceGoal;

  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) {
    throw new EnhanceApiError(400, 'Invalid video duration.');
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new EnhanceApiError(400, 'Invalid video resolution.');
  }
  if (!VALID_GOALS.has(goal)) {
    throw new EnhanceApiError(400, 'Invalid enhancement preset goal.');
  }

  const rawFrames = Array.isArray(raw.frames) ? raw.frames : [];
  if (rawFrames.length === 0 || rawFrames.length > 8) {
    throw new EnhanceApiError(400, 'Provide between 1 and 8 sampled video keyframes.');
  }

  const frames: VideoFrameSample[] = rawFrames.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new EnhanceApiError(400, `Frame #${idx + 1} is malformed.`);
    }
    const f = item as Record<string, unknown>;
    const mimeType =
      typeof f.mimeType === 'string' && VALID_MIMES.has(f.mimeType)
        ? (f.mimeType as VideoFrameSample['mimeType'])
        : 'image/jpeg';
    const dataBase64 = typeof f.dataBase64 === 'string' ? f.dataBase64.trim() : '';
    if (!dataBase64 || dataBase64.length > 450_000) {
      throw new EnhanceApiError(400, `Frame #${idx + 1} image payload is missing or too large.`);
    }
    return {
      timeSeconds: clampNum(Number(f.timeSeconds), 0, duration, 0),
      dataBase64,
      mimeType,
    };
  });

  const rawAudio = (raw.audioStats && typeof raw.audioStats === 'object'
    ? raw.audioStats
    : {}) as Record<string, unknown>;

  const audioStats: VideoAudioStats = {
    hasAudio: Boolean(rawAudio.hasAudio),
    avgLevel: clampNum(Number(rawAudio.avgLevel), 0, 1, 0),
    peakLevel: clampNum(Number(rawAudio.peakLevel), 0, 1, 0),
    quietRatio: clampNum(Number(rawAudio.quietRatio), 0, 1, 0),
    dynamicRange: clampNum(Number(rawAudio.dynamicRange), 0, 1, 0),
  };

  const customPrompt =
    typeof raw.customPrompt === 'string' ? raw.customPrompt.trim().slice(0, 300) : '';

  return {
    fileName: typeof raw.fileName === 'string' ? raw.fileName.slice(0, 160) : 'video.mp4',
    duration,
    width,
    height,
    fps: clampNum(fps, 1, 240, 30),
    goal,
    customPrompt,
    audioStats,
    frames,
  };
}

const ENHANCE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    visualStyleName: {
      type: Type.STRING,
      description: 'Short 2-4 word name for the auto-tune look, e.g. "Crisp Daylight Balance".',
    },
    summary: {
      type: Type.STRING,
      description: 'One concise sentence explaining what was detected and how this tune improves the footage.',
    },
    notes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 4 crisp bullet notes covering lighting, sharpness/noise, audio, and framing.',
    },
    color: {
      type: Type.OBJECT,
      properties: {
        brightness: {
          type: Type.NUMBER,
          description: 'FFmpeg eq brightness adjustment from -0.25 to 0.25 (0 is neutral).',
        },
        contrast: {
          type: Type.NUMBER,
          description: 'FFmpeg eq contrast multiplier from 0.70 to 1.45 (1.0 is neutral).',
        },
        saturation: {
          type: Type.NUMBER,
          description: 'FFmpeg eq saturation multiplier from 0.50 to 1.60 (1.0 is neutral).',
        },
        sharpen: {
          type: Type.NUMBER,
          description: 'FFmpeg unsharp strength from 0.0 to 1.0 (0 off, 0.35 subtle, 0.65 crisp).',
        },
        denoise: {
          type: Type.BOOLEAN,
          description: 'Enable FFmpeg hqdn3d video denoise when frames appear grainy, compressed, or low-light.',
        },
        videoFadeIn: {
          type: Type.NUMBER,
          description: 'Clip fade-in seconds from 0.0 to 1.5.',
        },
        videoFadeOut: {
          type: Type.NUMBER,
          description: 'Clip fade-out seconds from 0.0 to 1.5.',
        },
      },
      required: [
        'brightness',
        'contrast',
        'saturation',
        'sharpen',
        'denoise',
        'videoFadeIn',
        'videoFadeOut',
      ],
    },
    audio: {
      type: Type.OBJECT,
      properties: {
        volume: {
          type: Type.NUMBER,
          description: 'Audio gain multiplier from 0.6 to 1.6 (1.0 is neutral).',
        },
        normalize: {
          type: Type.BOOLEAN,
          description: 'Enable FFmpeg dynaudnorm loudness normalization for uneven or quiet audio.',
        },
        voiceEnhance: {
          type: Type.BOOLEAN,
          description: 'Enable vocal EQ + compressor (highpass 80Hz, lowpass 13kHz, acompressor) for clearer speech.',
        },
        fadeIn: {
          type: Type.NUMBER,
          description: 'Audio fade-in seconds from 0.0 to 1.5.',
        },
        fadeOut: {
          type: Type.NUMBER,
          description: 'Audio fade-out seconds from 0.0 to 1.5.',
        },
      },
      required: ['volume', 'normalize', 'voiceEnhance', 'fadeIn', 'fadeOut'],
    },
    framing: {
      type: Type.OBJECT,
      properties: {
        recommendedAspect: {
          type: Type.STRING,
          enum: ['original', '9:16', '1:1', '4:5', '16:9'],
        },
        recommendedFitMode: {
          type: Type.STRING,
          enum: ['crop', 'blur', 'solid'],
        },
        reason: { type: Type.STRING },
      },
      required: ['recommendedAspect', 'recommendedFitMode', 'reason'],
    },
    pacing: {
      type: Type.OBJECT,
      properties: {
        recommendedIntervalSeconds: {
          type: Type.NUMBER,
          description: 'Suggested auto-split clip interval in seconds (e.g. 15, 30, 45, or 60).',
        },
        suggestRemoveSilence: {
          type: Type.BOOLEAN,
          description: 'True if quietRatio is high and jump-cut silence removal would tighten pacing.',
        },
        reason: { type: Type.STRING },
      },
      required: ['recommendedIntervalSeconds', 'suggestRemoveSilence', 'reason'],
    },
    suggestedClips: {
      type: Type.ARRAY,
      description: 'Up to 3 high-impact highlight clip ranges within [0, duration].',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          startTime: { type: Type.NUMBER },
          endTime: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ['label', 'startTime', 'endTime', 'reason'],
      },
    },
  },
  required: [
    'visualStyleName',
    'summary',
    'notes',
    'color',
    'audio',
    'framing',
    'pacing',
    'suggestedClips',
  ],
};

function buildPromptText(req: EnhanceVideoRequest): string {
  const goalDescriptions: Record<ServerEnhanceGoal, string> = {
    auto: 'Balanced Auto-Tune: fix exposure, white-balance feel, contrast, clarity, and vocal loudness while keeping skin tones and colors natural.',
    cinematic: 'Cinematic Polish: subtle filmic contrast, rich controlled saturation, gentle fades, clean denoise if shadows are noisy, balanced audio.',
    'social-punch': 'Social Punch (Reels/Shorts/TikTok): vibrant colors, crisp sharpness, punchy contrast, loud clear voice, vertical 9:16 framing when suitable, snappy 15s-30s clip pacing.',
    'clean-studio': 'Clean Studio / Tutorial: bright neutral clarity, crisp text/detail sharpening, light denoise, vocal clarity EQ + loudness normalization.',
    podcast: 'Talking Head / Podcast: natural flattering exposure, light denoise, strong vocal clarity EQ + compressor + loudness normalization, silence jump-cut suggestion if quietRatio > 0.22.',
  };

  const frameList = req.frames
    .map((f, i) => `Frame ${i + 1} at ${f.timeSeconds.toFixed(1)}s`)
    .join(', ');

  return [
    'You are an expert colorist, finishing editor, and audio mastering engineer inside Slicemark.',
    'Analyze the attached chronological video keyframes and audio telemetry to produce a precise, tasteful, FFmpeg-ready auto-tune plan.',
    '',
    `Target Style Goal: ${goalDescriptions[req.goal]}`,
    req.customPrompt ? `User Custom Direction: "${req.customPrompt}"` : 'User Custom Direction: None',
    '',
    'Video Telemetry:',
    `- File: ${req.fileName}`,
    `- Resolution: ${req.width}x${req.height} @ ${req.fps}fps`,
    `- Duration: ${req.duration.toFixed(2)}s`,
    `- Sampled Keyframes: ${frameList}`,
    `- Audio Track: ${req.audioStats.hasAudio ? 'Present' : 'No audio stream detected'}`,
    req.audioStats.hasAudio
      ? `- Audio Levels (0..1 scale): avg=${req.audioStats.avgLevel.toFixed(2)}, peak=${req.audioStats.peakLevel.toFixed(2)}, quietRatio=${req.audioStats.quietRatio.toFixed(2)}, dynamicRange=${req.audioStats.dynamicRange.toFixed(2)}`
      : '- Audio Levels: N/A (leave volume=1.0, normalize=false, voiceEnhance=false)',
    '',
    'Calibration Guidelines:',
    '- Be tasteful and realistic; avoid blown-out brightness or neon oversaturation.',
    '- brightness stays within [-0.22, +0.22]. Dark/underexposed footage gets +0.04 to +0.16; overexposed gets -0.04 to -0.14.',
    '- contrast stays within [0.85, 1.38]. Flat/washed-out footage gets 1.08 to 1.24.',
    '- saturation stays within [0.80, 1.45]. Dull footage gets 1.08 to 1.28.',
    '- sharpen stays within [0.0, 0.85]. Slightly soft footage gets 0.25 to 0.55; already razor-sharp graphics get 0.0 to 0.2.',
    '- Enable denoise=true only if frames show low-light grain, macroblocking, or noise.',
    '- For audio: if avgLevel < 0.28 and hasAudio=true, enable normalize=true and lift volume slightly (1.1 to 1.35). Enable voiceEnhance=true for speech/podcast/social/studio unless music-only.',
    '- For suggestedClips: return 1 to 3 clips strictly inside [0, duration], each at least 2 seconds long (or full duration if video < 4s).',
    '- Return strictly valid JSON matching the schema.',
  ].join('\n');
}

function sanitizePlan(raw: Record<string, unknown>, req: EnhanceVideoRequest): ServerEnhancePlan {
  const colorRaw = (raw.color && typeof raw.color === 'object' ? raw.color : {}) as Record<
    string,
    unknown
  >;
  const audioRaw = (raw.audio && typeof raw.audio === 'object' ? raw.audio : {}) as Record<
    string,
    unknown
  >;
  const framingRaw = (raw.framing && typeof raw.framing === 'object' ? raw.framing : {}) as Record<
    string,
    unknown
  >;
  const pacingRaw = (raw.pacing && typeof raw.pacing === 'object' ? raw.pacing : {}) as Record<
    string,
    unknown
  >;

  const recommendedAspect =
    typeof framingRaw.recommendedAspect === 'string' &&
    VALID_ASPECTS.has(framingRaw.recommendedAspect)
      ? (framingRaw.recommendedAspect as ServerEnhancePlan['framing']['recommendedAspect'])
      : 'original';

  const recommendedFitMode =
    typeof framingRaw.recommendedFitMode === 'string' &&
    VALID_FIT_MODES.has(framingRaw.recommendedFitMode)
      ? (framingRaw.recommendedFitMode as ServerEnhancePlan['framing']['recommendedFitMode'])
      : 'crop';

  const rawNotes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 5)
    : [];

  const rawClips = Array.isArray(raw.suggestedClips) ? raw.suggestedClips : [];
  const suggestedClips: ServerSuggestedClip[] = [];
  for (let i = 0; i < Math.min(4, rawClips.length); i++) {
    const item = rawClips[i];
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const startTime = roundTo(clampNum(Number(c.startTime), 0, Math.max(0, req.duration - 0.5), 0), 2);
    const minEnd = Math.min(req.duration, startTime + Math.min(2, req.duration));
    const endTime = roundTo(clampNum(Number(c.endTime), minEnd, req.duration, req.duration), 2);
    if (endTime - startTime < 0.5) continue;
    suggestedClips.push({
      label:
        typeof c.label === 'string' && c.label.trim()
          ? c.label.trim().slice(0, 48)
          : `highlight_${String(i + 1).padStart(2, '0')}`,
      startTime,
      endTime,
      reason:
        typeof c.reason === 'string' && c.reason.trim()
          ? c.reason.trim().slice(0, 140)
          : 'Recommended highlight window',
    });
  }

  return {
    visualStyleName:
      typeof raw.visualStyleName === 'string' && raw.visualStyleName.trim()
        ? raw.visualStyleName.trim().slice(0, 60)
        : 'Auto-Tuned Master',
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim().slice(0, 260)
        : 'Balanced exposure, contrast, sharpness, and vocal clarity across the footage.',
    notes: rawNotes.length > 0 ? rawNotes : ['Calibrated tone curve and clarity for clean playback.'],
    color: {
      brightness: roundTo(clampNum(colorRaw.brightness, -0.3, 0.3, 0), 2),
      contrast: roundTo(clampNum(colorRaw.contrast, 0.5, 1.8, 1), 2),
      saturation: roundTo(clampNum(colorRaw.saturation, 0, 2, 1), 2),
      sharpen: roundTo(clampNum(colorRaw.sharpen, 0, 1, 0), 2),
      denoise: Boolean(colorRaw.denoise),
      videoFadeIn: roundTo(clampNum(colorRaw.videoFadeIn, 0, 2, 0), 1),
      videoFadeOut: roundTo(clampNum(colorRaw.videoFadeOut, 0, 2, 0), 1),
    },
    audio: req.audioStats.hasAudio
      ? {
          volume: roundTo(clampNum(audioRaw.volume, 0.5, 1.8, 1), 2),
          normalize: Boolean(audioRaw.normalize),
          voiceEnhance: Boolean(audioRaw.voiceEnhance),
          fadeIn: roundTo(clampNum(audioRaw.fadeIn, 0, 2, 0), 1),
          fadeOut: roundTo(clampNum(audioRaw.fadeOut, 0, 2, 0), 1),
        }
      : {
          volume: 1,
          normalize: false,
          voiceEnhance: false,
          fadeIn: 0,
          fadeOut: 0,
        },
    framing: {
      recommendedAspect,
      recommendedFitMode,
      reason:
        typeof framingRaw.reason === 'string' && framingRaw.reason.trim()
          ? framingRaw.reason.trim().slice(0, 180)
          : 'Preserves native composition cleanly.',
    },
    pacing: {
      recommendedIntervalSeconds: Math.round(
        clampNum(pacingRaw.recommendedIntervalSeconds, 5, Math.max(15, Math.ceil(req.duration)), 15)
      ),
      suggestRemoveSilence: Boolean(pacingRaw.suggestRemoveSilence) && req.audioStats.hasAudio,
      reason:
        typeof pacingRaw.reason === 'string' && pacingRaw.reason.trim()
          ? pacingRaw.reason.trim().slice(0, 180)
          : 'Matches natural visual pacing.',
    },
    suggestedClips,
  };
}

function mapGeminiError(err: unknown): EnhanceApiError {
  if (err instanceof EnhanceApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const statusMatch = rawMessage.match(/\b(400|401|403|404|429|500|502|503)\b/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMessage)) {
    return new EnhanceApiError(
      429,
      'Gemini free-tier rate limit reached. Wait a few seconds and try Auto-Tune again.'
    );
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMessage)) {
    return new EnhanceApiError(
      403,
      'Gemini API key was rejected or lacks permission. Verify GEMINI_API_KEY in your environment settings.'
    );
  }
  if (status >= 500) {
    return new EnhanceApiError(
      502,
      'Gemini service is temporarily unavailable. Please retry in a moment.'
    );
  }
  return new EnhanceApiError(status, rawMessage || 'AI video analysis failed.');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeAndEnhanceVideo(body: unknown): Promise<ServerEnhancePlan> {
  const req = validateRequest(body);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new EnhanceApiError(
      503,
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in your AI Studio Secrets or Vercel Environment Variables.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: buildPromptText(req) }];

  for (const frame of req.frames) {
    parts.push({
      inlineData: {
        mimeType: frame.mimeType,
        data: frame.dataBase64,
      },
    });
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: ENHANCE_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const text = response.text;
      if (!text || !text.trim()) {
        throw new EnhanceApiError(502, 'Gemini returned an empty auto-tune response.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new EnhanceApiError(502, 'Gemini returned malformed JSON. Please retry.');
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new EnhanceApiError(502, 'Unexpected auto-tune response structure.');
      }

      return sanitizePlan(parsed as Record<string, unknown>, req);
    } catch (err) {
      lastErr = err;
      const mapped = mapGeminiError(err);
      const retryable = mapped.status >= 500 && attempt < 2;
      if (!retryable) {
        throw mapped;
      }
      await sleep(450 * Math.pow(2, attempt));
    }
  }

  throw mapGeminiError(lastErr);
}
