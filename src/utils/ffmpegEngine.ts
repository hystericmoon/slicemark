import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreAssetUrl from '@ffmpeg/core?url';
import wasmAssetUrl from '@ffmpeg/core/wasm?url';
import JSZip from 'jszip';
import {
  AudioSettings,
  ClipSegment,
  ExportProgressState,
  ExportSettings,
  ManualCutMode,
  MediaSource,
  OverlaySettings,
  PlaybackSettings,
  SubtitleSettings,
  TransformSettings,
} from '../types/editor';
import { computeOutputResolution } from './segmentGenerator';
import {
  renderOverlayPlatePng,
  renderSubtitleCuePng,
  serializeCuesToSrt,
  sliceCuesForClip,
} from './subtitles';
import { formatTimecode, sanitizeFilename } from './timecode';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function getFFmpegInstance(
  onStatus?: (msg: string) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ff = new FFmpeg();
    onStatus?.('Loading FFmpeg WebAssembly engine...');

    try {
      const coreURL = await toBlobURL(coreAssetUrl, 'text/javascript');
      const wasmURL = await toBlobURL(wasmAssetUrl, 'application/wasm');
      await ff.load({ coreURL, wasmURL });
    } catch {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      await ff.load({ coreURL, wasmURL });
    }

    ffmpegInstance = ff;
    return ff;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function resetFFmpegInstance(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // ignore termination errors
    }
  }
  ffmpegInstance = null;
  loadPromise = null;
}

/**
 * Checks whether active visual, audio, overlay, subtitle, motion, format, or delivery settings require re-encoding.
 */
export function requiresReencode(
  transform: TransformSettings,
  overlay: OverlaySettings,
  subtitles: SubtitleSettings,
  audio: AudioSettings,
  playback: PlaybackSettings,
  manualCutMode: ManualCutMode,
  exportSettings: ExportSettings
): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (exportSettings.engineMode === 'reencode') {
    reasons.push('Frame-accurate mode');
  }
  if (exportSettings.format !== 'mp4') {
    reasons.push(`Format ${exportSettings.format.toUpperCase()}`);
  }
  if (exportSettings.resolution !== 'original') {
    reasons.push(`Scale ${exportSettings.resolution}p`);
  }
  if (exportSettings.deliveryMode === 'merge') {
    reasons.push('Merge highlight reel');
  }
  if (
    transform.aspectPreset !== 'original' ||
    transform.crop.x > 0.002 ||
    transform.crop.y > 0.002 ||
    transform.crop.width < 0.998 ||
    transform.crop.height < 0.998
  ) {
    reasons.push(
      transform.fitMode === 'crop'
        ? 'Aspect crop'
        : `${transform.fitMode === 'blur' ? 'Blur' : 'Solid'} backdrop`
    );
  }
  if (transform.rotation !== 0) {
    reasons.push(`Rotation (${transform.rotation}°)`);
  }
  if (transform.flipHorizontal) {
    reasons.push('Horizontal flip');
  }
  if (
    Math.abs(transform.color.brightness) > 0.01 ||
    Math.abs(transform.color.contrast - 1) > 0.01 ||
    Math.abs(transform.color.saturation - 1) > 0.01
  ) {
    reasons.push('Color adjustments');
  }
  if (transform.color.sharpen > 0.02) {
    reasons.push(`Sharpen (${Math.round(transform.color.sharpen * 100)}%)`);
  }
  if (transform.color.denoise) {
    reasons.push('Video denoise');
  }
  if (transform.color.videoFadeIn > 0.05 || transform.color.videoFadeOut > 0.05) {
    reasons.push('Video fades');
  }
  if (
    overlay.showPartNumber ||
    overlay.watermarkText.trim().length > 0 ||
    overlay.showTimestamp ||
    Boolean(overlay.logoDataUrl)
  ) {
    reasons.push('Watermark / Part overlay');
  }
  if (subtitles.burnIn && subtitles.cues.length > 0) {
    reasons.push('Burned-in subtitles');
  }
  if (audio.muted) {
    reasons.push('Audio muted');
  } else {
    if (Math.abs(audio.volume - 1) > 0.01) {
      reasons.push(`Volume ${Math.round(audio.volume * 100)}%`);
    }
    if (audio.fadeIn > 0.05 || audio.fadeOut > 0.05) {
      reasons.push('Audio fades');
    }
    if (audio.voiceEnhance) {
      reasons.push('Voice clarity EQ');
    }
    if (audio.normalize) {
      reasons.push('Audio normalize');
    }
  }
  if (audio.bgAudio.file) {
    reasons.push('Background audio mix');
  }
  if (Math.abs(playback.speed - 1) > 0.01) {
    reasons.push(`Speed ${playback.speed}x`);
  }
  if (playback.motionMode !== 'normal') {
    reasons.push(playback.motionMode === 'reverse' ? 'Reverse' : 'Boomerang');
  }
  if (manualCutMode === 'remove-middle') {
    reasons.push('Remove-middle stitch');
  }

  return { required: reasons.length > 0, reasons };
}

function getInputExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match && ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'avi', 'mp3', 'wav', 'm4a', 'ogg'].includes(match[1])) {
    return match[1];
  }
  return 'mp4';
}

function getCrfValue(quality: ExportSettings['quality']): string {
  switch (quality) {
    case 'high':
      return '19';
    case 'compact':
      return '28';
    default:
      return '23';
  }
}

function getTargetMaxHeight(resolution: ExportSettings['resolution']): number | undefined {
  switch (resolution) {
    case '1080':
      return 1080;
    case '720':
      return 720;
    case '480':
      return 480;
    default:
      return undefined;
  }
}

export interface ExportOptions {
  source: MediaSource;
  segments: ClipSegment[];
  transform: TransformSettings;
  overlay: OverlaySettings;
  subtitles: SubtitleSettings;
  audio: AudioSettings;
  playback: PlaybackSettings;
  manualCutMode: ManualCutMode;
  exportSettings: ExportSettings;
  onProgress: (state: ExportProgressState) => void;
  abortSignal?: AbortSignal;
}

/**
 * Encodes a single clip with the complete video/audio/overlay/subtitle/motion filter graph.
 */
async function encodeClipToFile(params: {
  ff: FFmpeg;
  inputName: string;
  bgAudioInputName: string | null;
  outName: string;
  source: MediaSource;
  clip: ClipSegment;
  clipIndex: number;
  totalClips: number;
  transform: TransformSettings;
  overlay: OverlaySettings;
  subtitles: SubtitleSettings;
  audio: AudioSettings;
  playback: PlaybackSettings;
  exportSettings: ExportSettings;
  extraVideoFadeIn?: number;
  extraVideoFadeOut?: number;
  forceMp4Intermediate?: boolean;
}): Promise<void> {
  const {
    ff,
    inputName,
    bgAudioInputName,
    outName,
    source,
    clip,
    clipIndex,
    totalClips,
    transform,
    overlay,
    subtitles,
    audio,
    playback,
    exportSettings,
    extraVideoFadeIn = 0,
    extraVideoFadeOut = 0,
    forceMp4Intermediate = false,
  } = params;

  const clipDur = Math.max(0.1, clip.endTime - clip.startTime);
  const format = forceMp4Intermediate ? 'mp4' : exportSettings.format;
  const maxHeight = getTargetMaxHeight(exportSettings.resolution);
  const outRes = computeOutputResolution(
    source.width,
    source.height,
    transform.rotation,
    transform.crop,
    transform.aspectPreset,
    transform.fitMode,
    maxHeight
  );

  // Audio-only fast path (MP3 / WAV)
  if (format === 'mp3' || format === 'wav') {
    const args: string[] = [
      '-ss',
      clip.startTime.toFixed(3),
      '-t',
      clipDur.toFixed(3),
      '-i',
      inputName,
    ];

    const af: string[] = [];
    if (Math.abs(playback.speed - 1) > 0.01) {
      af.push(`atempo=${playback.speed.toFixed(2)}`);
    }
    if (playback.motionMode === 'reverse') {
      af.push('areverse');
    }
    if (Math.abs(audio.volume - 1) > 0.01) {
      af.push(`volume=${audio.volume.toFixed(2)}`);
    }
    if (audio.voiceEnhance) {
      af.push('highpass=f=80,lowpass=f=13000,acompressor=threshold=-18dB:ratio=3:attack=20:release=200');
    }
    if (audio.normalize) {
      af.push('dynaudnorm');
    }
    const effDur = clipDur / playback.speed;
    if (audio.fadeIn > 0.05) {
      af.push(`afade=t=in:st=0:d=${Math.min(audio.fadeIn, effDur * 0.45).toFixed(2)}`);
    }
    if (audio.fadeOut > 0.05) {
      const d = Math.min(audio.fadeOut, effDur * 0.45);
      af.push(`afade=t=out:st=${Math.max(0, effDur - d).toFixed(2)}:d=${d.toFixed(2)}`);
    }

    if (bgAudioInputName) {
      if (audio.bgAudio.loop) {
        args.push('-stream_loop', '-1');
      }
      args.push('-i', bgAudioInputName);
      if (audio.muted) {
        args.push(
          '-filter_complex',
          `[1:a]atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${audio.bgAudio.volume.toFixed(2)}[aout]`,
          '-map',
          '[aout]'
        );
      } else {
        const mainChain = af.length > 0 ? `[0:a]${af.join(',')}[a0]` : '[0:a]anull[a0]';
        const bgChain = `[1:a]atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${audio.bgAudio.volume.toFixed(2)}[a1]`;
        args.push(
          '-filter_complex',
          `${mainChain};${bgChain};[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
          '-map',
          '[aout]'
        );
      }
    } else {
      args.push('-vn');
      if (af.length > 0) {
        args.push('-af', af.join(','));
      }
    }

    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-q:a', '2', '-y', outName);
    } else {
      args.push('-c:a', 'pcm_s16le', '-y', outName);
    }

    const code = await ff.exec(args);
    if (code !== 0) {
      throw new Error(`Could not extract ${format.toUpperCase()} audio for "${clip.label}".`);
    }
    return;
  }

  // Video + Optional Overlay + Optional Burned Subtitles + Optional Bg Audio
  // IMPORTANT: -ss and -t MUST precede -i inputName so they bound input 0 even when extra -i inputs follow
  const tempFiles: string[] = [];
  const inputs: string[] = [
    '-ss',
    clip.startTime.toFixed(3),
    '-t',
    clipDur.toFixed(3),
    '-i',
    inputName,
  ];

  let nextInputIdx = 1;
  let bgAudioIdx: number | null = null;
  if (bgAudioInputName && format !== 'gif' && playback.motionMode !== 'boomerang') {
    if (audio.bgAudio.loop) {
      inputs.push('-stream_loop', '-1');
    }
    inputs.push('-i', bgAudioInputName);
    bgAudioIdx = nextInputIdx++;
  }

  // Prepare Canvas PNG overlay plate if any watermark / Part 1/N / logo / timestamp is active
  let overlayInputIdx: number | null = null;
  const clipRangeLabel = `${formatTimecode(clip.startTime)} – ${formatTimecode(clip.endTime)}`;
  const overlayBytes = await renderOverlayPlatePng(
    outRes.width,
    outRes.height,
    overlay,
    clipIndex,
    totalClips,
    clipRangeLabel
  );
  if (overlayBytes) {
    const ovName = `ov_${clipIndex}.png`;
    await ff.writeFile(ovName, overlayBytes);
    tempFiles.push(ovName);
    inputs.push('-i', ovName);
    overlayInputIdx = nextInputIdx++;
  }

  // Prepare burned-in subtitle PNG plates (capped at 20 cues per clip for responsive WASM memory)
  const burnedCues: Array<{ inputIdx: number; start: number; end: number }> = [];
  if (subtitles.burnIn && subtitles.cues.length > 0 && playback.motionMode === 'normal') {
    const clipCues = sliceCuesForClip(
      subtitles.cues,
      clip.startTime,
      clip.endTime,
      playback.speed
    ).slice(0, 20);
    for (let c = 0; c < clipCues.length; c++) {
      const cuePng = await renderSubtitleCuePng(outRes.width, outRes.height, clipCues[c].text);
      if (cuePng) {
        const cueName = `sub_${clipIndex}_${c}.png`;
        await ff.writeFile(cueName, cuePng);
        tempFiles.push(cueName);
        inputs.push('-i', cueName);
        burnedCues.push({
          inputIdx: nextInputIdx++,
          start: clipCues[c].start,
          end: clipCues[c].end,
        });
      }
    }
  }

  // Build Filter Complex Graph
  const graph: string[] = [];
  let vLabel = '0:v';

  // 1. Rotation + Flip
  const preFilters: string[] = [];
  if (transform.rotation === 90) preFilters.push('transpose=1');
  else if (transform.rotation === 180) preFilters.push('transpose=1,transpose=1');
  else if (transform.rotation === 270) preFilters.push('transpose=2');
  if (transform.flipHorizontal) preFilters.push('hflip');

  if (preFilters.length > 0) {
    graph.push(`[${vLabel}]${preFilters.join(',')}[vpre]`);
    vLabel = 'vpre';
  }

  // 2. Aspect Ratio & Fit Mode (Crop vs Blur Backdrop vs Solid Backdrop)
  const isAspectActive =
    transform.aspectPreset !== 'original' ||
    transform.crop.x > 0.002 ||
    transform.crop.y > 0.002 ||
    transform.crop.width < 0.998 ||
    transform.crop.height < 0.998;

  if (isAspectActive && transform.fitMode === 'blur' && transform.aspectPreset !== 'original') {
    const blurRadius = Math.min(14, Math.max(2, Math.floor(Math.min(outRes.width, outRes.height) / 12)));
    graph.push(
      `[${vLabel}]split=2[vbg][vfg];` +
        `[vbg]scale=${outRes.width}:${outRes.height}:force_original_aspect_ratio=increase,crop=${outRes.width}:${outRes.height},boxblur=${blurRadius}:2[vbgb];` +
        `[vfg]scale=${outRes.width}:${outRes.height}:force_original_aspect_ratio=decrease[vfgs];` +
        `[vbgb][vfgs]overlay=(W-w)/2:(H-h)/2[vfit]`
    );
    vLabel = 'vfit';
  } else if (isAspectActive && transform.fitMode === 'solid' && transform.aspectPreset !== 'original') {
    const hexColor = transform.backdropColor.replace('#', '0x') || '0x111111';
    graph.push(
      `[${vLabel}]scale=${outRes.width}:${outRes.height}:force_original_aspect_ratio=decrease,` +
        `pad=${outRes.width}:${outRes.height}:(ow-iw)/2:(oh-ih)/2:color=${hexColor}[vfit]`
    );
    vLabel = 'vfit';
  } else {
    const cropScale: string[] = [];
    if (isAspectActive) {
      const nativeCrop = computeOutputResolution(
        source.width,
        source.height,
        transform.rotation,
        transform.crop,
        transform.aspectPreset,
        'crop'
      );
      cropScale.push(`crop=${nativeCrop.width}:${nativeCrop.height}:${nativeCrop.x}:${nativeCrop.y}`);
    }
    if (maxHeight || isAspectActive) {
      cropScale.push(`scale=${outRes.width}:${outRes.height}`);
    } else {
      cropScale.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }
    graph.push(`[${vLabel}]${cropScale.join(',')}[vfit]`);
    vLabel = 'vfit';
  }

  // 3. Denoise, Color Grading & Sharpening
  const { brightness, contrast, saturation, sharpen, denoise, videoFadeIn, videoFadeOut } =
    transform.color;
  const enhanceFilters: string[] = [];
  if (denoise) {
    enhanceFilters.push('hqdn3d=1.5:1.5:6:6');
  }
  if (
    Math.abs(brightness) > 0.01 ||
    Math.abs(contrast - 1) > 0.01 ||
    Math.abs(saturation - 1) > 0.01
  ) {
    enhanceFilters.push(
      `eq=brightness=${brightness.toFixed(2)}:contrast=${contrast.toFixed(
        2
      )}:saturation=${saturation.toFixed(2)}`
    );
  }
  if (sharpen > 0.02) {
    const lumaAmount = Math.min(1.5, Math.max(0.1, sharpen * 1.5)).toFixed(2);
    enhanceFilters.push(`unsharp=5:5:${lumaAmount}:5:5:0.0`);
  }
  if (enhanceFilters.length > 0) {
    graph.push(`[${vLabel}]${enhanceFilters.join(',')}[veq]`);
    vLabel = 'veq';
  }

  // 4. Speed + Motion (Reverse / Boomerang) + Video Fade In / Out
  // Apply reverse BEFORE fades so fade-in always occurs at clip start and fade-out at clip end
  const effDur = clipDur / playback.speed;
  const speedAndFade: string[] = [];
  if (Math.abs(playback.speed - 1) > 0.01) {
    speedAndFade.push(`setpts=${(1 / playback.speed).toFixed(4)}*PTS`);
  }
  if (playback.motionMode === 'reverse') {
    speedAndFade.push('reverse');
  }

  const totalFadeIn = Math.max(videoFadeIn, extraVideoFadeIn);
  const totalFadeOut = Math.max(videoFadeOut, extraVideoFadeOut);
  if (totalFadeIn > 0.05) {
    speedAndFade.push(`fade=t=in:st=0:d=${Math.min(totalFadeIn, effDur * 0.45).toFixed(2)}`);
  }
  if (totalFadeOut > 0.05 && playback.motionMode !== 'boomerang') {
    const d = Math.min(totalFadeOut, effDur * 0.45);
    speedAndFade.push(`fade=t=out:st=${Math.max(0, effDur - d).toFixed(2)}:d=${d.toFixed(2)}`);
  }

  if (speedAndFade.length > 0) {
    graph.push(`[${vLabel}]${speedAndFade.join(',')}[vspd]`);
    vLabel = 'vspd';
  }

  if (playback.motionMode === 'boomerang') {
    graph.push(
      `[${vLabel}]split=2[vbf][vbr];[vbr]reverse[vbrev];[vbf][vbrev]concat=n=2:v=1:a=0[vboom]`
    );
    vLabel = 'vboom';
  }

  // 5. Watermark / Part 1/N / Logo Plate Overlay
  if (overlayInputIdx !== null) {
    graph.push(`[${vLabel}][${overlayInputIdx}:v]overlay=0:0[vov]`);
    vLabel = 'vov';
  }

  // 6. Burned-in Subtitles Overlay Chain
  for (let i = 0; i < burnedCues.length; i++) {
    const c = burnedCues[i];
    const nextLbl = `vsub_${i}`;
    graph.push(
      `[${vLabel}][${c.inputIdx}:v]overlay=0:0:enable='between(t,${c.start.toFixed(
        2
      )},${c.end.toFixed(2)})'[${nextLbl}]`
    );
    vLabel = nextLbl;
  }

  // 7. GIF Palette Generator or Final Video Stream Label
  if (format === 'gif') {
    const gifWidth = Math.min(480, outRes.width);
    graph.push(
      `[${vLabel}]fps=12,scale=${gifWidth}:-2:flags=lanczos,split[gs0][gs1];[gs0]palettegen[gp];[gs1][gp]paletteuse[vout]`
    );
    vLabel = 'vout';
  }

  // 8. Audio Filter Graph (when video format supports audio and not boomerang)
  const includeAudio =
    format !== 'gif' &&
    playback.motionMode !== 'boomerang' &&
    (!audio.muted || bgAudioIdx !== null);

  let audioMapLabel: string | null = null;
  if (includeAudio) {
    const af: string[] = [];
    if (Math.abs(playback.speed - 1) > 0.01) {
      af.push(`atempo=${playback.speed.toFixed(2)}`);
    }
    if (playback.motionMode === 'reverse') {
      af.push('areverse');
    }
    if (Math.abs(audio.volume - 1) > 0.01) {
      af.push(`volume=${audio.volume.toFixed(2)}`);
    }
    if (audio.voiceEnhance) {
      af.push('highpass=f=80,lowpass=f=13000,acompressor=threshold=-18dB:ratio=3:attack=20:release=200');
    }
    if (audio.normalize) {
      af.push('dynaudnorm');
    }
    if (audio.fadeIn > 0.05) {
      af.push(`afade=t=in:st=0:d=${Math.min(audio.fadeIn, effDur * 0.45).toFixed(2)}`);
    }
    if (audio.fadeOut > 0.05) {
      const d = Math.min(audio.fadeOut, effDur * 0.45);
      af.push(`afade=t=out:st=${Math.max(0, effDur - d).toFixed(2)}:d=${d.toFixed(2)}`);
    }

    if (bgAudioIdx !== null && audio.muted) {
      graph.push(
        `[${bgAudioIdx}:a]atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${audio.bgAudio.volume.toFixed(
          2
        )}[aout]`
      );
      audioMapLabel = '[aout]';
    } else if (bgAudioIdx !== null && !audio.muted) {
      const mainChain = af.length > 0 ? `[0:a]${af.join(',')}[a0]` : '[0:a]anull[a0]';
      const bgChain = `[${bgAudioIdx}:a]atrim=0:${effDur.toFixed(
        3
      )},asetpts=PTS-STARTPTS,volume=${audio.bgAudio.volume.toFixed(2)}[a1]`;
      graph.push(
        `${mainChain};${bgChain};[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`
      );
      audioMapLabel = '[aout]';
    } else if (!audio.muted && source.hasAudio) {
      if (af.length > 0) {
        graph.push(`[0:a]${af.join(',')}[aout]`);
        audioMapLabel = '[aout]';
      } else {
        audioMapLabel = '0:a?';
      }
    }
  }

  const execWithAudio = async (
    audioStrategy: 'full' | 'bg-only' | 'none'
  ): Promise<number> => {
    const args: string[] = [...inputs];
    let activeGraph = graph;
    let activeAudioMap = audioMapLabel;

    if (audioStrategy === 'none') {
      activeGraph = graph.filter(
        (step) =>
          !step.includes('[aout]') && !step.includes('[a0]') && !step.includes('[a1]')
      );
      activeAudioMap = null;
    } else if (audioStrategy === 'bg-only' && bgAudioIdx !== null) {
      activeGraph = [
        ...graph.filter(
          (step) =>
            !step.includes('[aout]') && !step.includes('[a0]') && !step.includes('[a1]')
        ),
        `[${bgAudioIdx}:a]atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${audio.bgAudio.volume.toFixed(
          2
        )}[aout]`,
      ];
      activeAudioMap = '[aout]';
    }

    if (activeGraph.length > 0) {
      args.push('-filter_complex', activeGraph.join(';'));
    }

    args.push('-map', vLabel === '0:v' ? '0:v' : `[${vLabel}]`);

    if (format === 'gif') {
      args.push('-an', '-y', outName);
    } else if (format === 'webm') {
      args.push(
        '-c:v',
        'libvpx',
        '-b:v',
        exportSettings.quality === 'high' ? '2M' : '1M',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8'
      );
      if (activeAudioMap) {
        args.push('-map', activeAudioMap, '-c:a', 'libvorbis', '-q:a', '4');
      } else {
        args.push('-an');
      }
      args.push('-y', outName);
    } else {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        getCrfValue(exportSettings.quality),
        '-pix_fmt',
        'yuv420p'
      );
      if (activeAudioMap) {
        args.push('-map', activeAudioMap, '-c:a', 'aac', '-b:a', '128k');
      } else {
        args.push('-an');
      }
      args.push('-movflags', '+faststart', '-y', outName);
    }

    return ff.exec(args);
  };

  try {
    let code = await execWithAudio(audioMapLabel ? 'full' : 'none');
    if (code !== 0 && audioMapLabel && bgAudioIdx !== null && !audio.muted) {
      // Source video had no audio stream; keep background track cleanly
      code = await execWithAudio('bg-only');
    }
    if (code !== 0 && audioMapLabel) {
      // Retry video-only if input stream had no decodable audio track
      code = await execWithAudio('none');
    }
    if (code !== 0) {
      throw new Error(`Failed to encode "${clip.label}".`);
    }
  } finally {
    for (const f of tempFiles) {
      await ff.deleteFile(f).catch(() => undefined);
    }
  }
}

export async function runFFmpegExport(options: ExportOptions): Promise<ExportProgressState> {
  const {
    source,
    segments,
    transform,
    overlay,
    subtitles,
    audio,
    playback,
    manualCutMode,
    exportSettings,
    onProgress,
    abortSignal,
  } = options;

  const activeClips = segments.filter((s) => s.selected && s.endTime - s.startTime >= 0.1);
  if (activeClips.length === 0) {
    throw new Error('Select at least one clip to export.');
  }

  const reencodeCheck = requiresReencode(
    transform,
    overlay,
    subtitles,
    audio,
    playback,
    manualCutMode,
    exportSettings
  );
  const ext = getInputExtension(source.name);
  const mustReencode = reencodeCheck.required || ext === 'webm';

  const isMergeDelivery =
    exportSettings.deliveryMode === 'merge' &&
    manualCutMode !== 'remove-middle' &&
    exportSettings.format === 'mp4' &&
    activeClips.length > 1;

  const totalJobs =
    manualCutMode === 'remove-middle'
      ? 1
      : activeClips.length;

  onProgress({
    status: 'loading-engine',
    message: 'Initializing FFmpeg.wasm engine...',
    currentClipIndex: 0,
    totalClips: totalJobs,
    clipPercent: 0,
    overallPercent: 2,
    usedReencode: mustReencode,
    format: exportSettings.format,
  });

  const ff = await getFFmpegInstance((msg) => {
    onProgress({
      status: 'loading-engine',
      message: msg,
      currentClipIndex: 0,
      totalClips: totalJobs,
      clipPercent: 0,
      overallPercent: 5,
      usedReencode: mustReencode,
      format: exportSettings.format,
    });
  });

  if (abortSignal?.aborted) {
    throw new Error('Export cancelled.');
  }

  const inputName = `source_input.${ext}`;
  await ff.writeFile(inputName, await fetchFile(source.file));

  let bgAudioInputName: string | null = null;
  if (audio.bgAudio.file) {
    const bgExt = getInputExtension(audio.bgAudio.file.name);
    bgAudioInputName = `bg_audio.${bgExt}`;
    await ff.writeFile(bgAudioInputName, await fetchFile(audio.bgAudio.file));
  }

  let activeClipIdx = 0;

  const progressHandler = ({ progress }: { progress: number }) => {
    const safeProgress = Number.isFinite(progress) ? progress : 0;
    const pct = Math.min(100, Math.max(0, Math.round(safeProgress * 100)));
    const overall = Math.min(
      95,
      Math.round(((activeClipIdx + pct / 100) / Math.max(1, totalJobs)) * 88 + 6)
    );
    onProgress({
      status: 'processing',
      message:
        manualCutMode === 'remove-middle'
          ? 'Removing cut section and stitching MP4...'
          : isMergeDelivery
            ? `Rendering segment ${activeClipIdx + 1} of ${totalJobs} for highlight reel...`
            : `Processing clip ${activeClipIdx + 1} of ${totalJobs}...`,
      currentClipIndex: activeClipIdx + 1,
      totalClips: totalJobs,
      clipPercent: pct,
      overallPercent: overall,
      usedReencode: mustReencode,
      format: exportSettings.format,
    });
  };

  ff.on('progress', progressHandler);

  try {
    // 1. Remove Middle Mode (cut out active segment & stitch remaining halves)
    if (manualCutMode === 'remove-middle' && activeClips.length === 1) {
      const cutSeg = activeClips[0];
      const keepRanges: ClipSegment[] = [];
      if (cutSeg.startTime > 0.15) {
        keepRanges.push({ ...cutSeg, id: 'keep_0', startTime: 0, endTime: cutSeg.startTime });
      }
      if (source.duration - cutSeg.endTime > 0.15) {
        keepRanges.push({
          ...cutSeg,
          id: 'keep_1',
          startTime: cutSeg.endTime,
          endTime: source.duration,
        });
      }
      if (keepRanges.length === 0) {
        throw new Error('The cut-out region covers the entire video. Narrow the selection to keep footage.');
      }

      const partFiles: string[] = [];
      for (let i = 0; i < keepRanges.length; i++) {
        if (abortSignal?.aborted) throw new Error('Export cancelled.');
        const partOut = `rm_part_${i}.mp4`;
        await encodeClipToFile({
          ff,
          inputName,
          bgAudioInputName,
          outName: partOut,
          source,
          clip: keepRanges[i],
          clipIndex: 0,
          totalClips: 1,
          transform,
          overlay,
          subtitles,
          audio,
          playback,
          exportSettings,
          forceMp4Intermediate: true,
        });
        partFiles.push(partOut);
      }

      let finalFile = partFiles[0];
      if (partFiles.length > 1) {
        await ff.writeFile(
          'rm_concat.txt',
          new TextEncoder().encode(partFiles.map((f) => `file '${f}'`).join('\n'))
        );
        finalFile = 'rm_stitched.mp4';
        await ff.exec([
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          'rm_concat.txt',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          '-y',
          finalFile,
        ]);
      }

      const raw = await ff.readFile(finalFile);
      const bytes = raw instanceof Uint8Array ? new Uint8Array(raw) : new TextEncoder().encode(raw);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      const base = sanitizeFilename(source.name.replace(/\.[^/.]+$/, ''));
      const filename = `${base}_stitched.mp4`;

      for (const f of partFiles) await ff.deleteFile(f).catch(() => undefined);
      await ff.deleteFile('rm_concat.txt').catch(() => undefined);
      await ff.deleteFile('rm_stitched.mp4').catch(() => undefined);

      return {
        status: 'done',
        message: `Exported ${filename}`,
        currentClipIndex: 1,
        totalClips: 1,
        clipPercent: 100,
        overallPercent: 100,
        usedReencode: true,
        downloadUrl: url,
        downloadFilename: filename,
      };
    }

    // 2. Merge Highlight Reel Delivery Mode (stiches selected clips in queue order!)
    if (isMergeDelivery) {
      const partFiles: string[] = [];
      const dip = exportSettings.mergeFadeDip;

      for (let i = 0; i < activeClips.length; i++) {
        if (abortSignal?.aborted) throw new Error('Export cancelled.');
        activeClipIdx = i;
        const partOut = `merge_part_${i}.mp4`;
        await encodeClipToFile({
          ff,
          inputName,
          bgAudioInputName,
          outName: partOut,
          source,
          clip: activeClips[i],
          clipIndex: i,
          totalClips: activeClips.length,
          transform,
          overlay,
          subtitles,
          audio,
          playback,
          exportSettings,
          extraVideoFadeIn: i > 0 ? dip : 0,
          extraVideoFadeOut: i < activeClips.length - 1 ? dip : 0,
          forceMp4Intermediate: true,
        });
        partFiles.push(partOut);
      }

      onProgress({
        status: 'packaging',
        message: `Stitching ${partFiles.length} clips into highlight reel...`,
        currentClipIndex: activeClips.length,
        totalClips: activeClips.length,
        clipPercent: 100,
        overallPercent: 96,
        usedReencode: true,
      });

      await ff.writeFile(
        'merge_list.txt',
        new TextEncoder().encode(partFiles.map((f) => `file '${f}'`).join('\n'))
      );
      await ff.exec([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'merge_list.txt',
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        'highlight_reel.mp4',
      ]);

      const raw = await ff.readFile('highlight_reel.mp4');
      const bytes = raw instanceof Uint8Array ? new Uint8Array(raw) : new TextEncoder().encode(raw);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      const base = sanitizeFilename(source.name.replace(/\.[^/.]+$/, ''));
      const filename = `${base}_highlight_reel.mp4`;

      for (const f of partFiles) await ff.deleteFile(f).catch(() => undefined);
      await ff.deleteFile('merge_list.txt').catch(() => undefined);
      await ff.deleteFile('highlight_reel.mp4').catch(() => undefined);

      return {
        status: 'done',
        message: `Merged ${activeClips.length} clips into ${filename}`,
        currentClipIndex: activeClips.length,
        totalClips: activeClips.length,
        clipPercent: 100,
        overallPercent: 100,
        usedReencode: true,
        downloadUrl: url,
        downloadFilename: filename,
      };
    }

    // 3. Individual / Batch Export Mode
    const outExt = exportSettings.format;
    const mimeByFormat: Record<ExportSettings['format'], string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      gif: 'image/gif',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
    };

    const exportedItems: Array<{ filename: string; bytes: Uint8Array; mime: string }> = [];

    for (let i = 0; i < activeClips.length; i++) {
      if (abortSignal?.aborted) throw new Error('Export cancelled.');
      activeClipIdx = i;
      const clip = activeClips[i];
      const clipDur = Math.max(0.1, clip.endTime - clip.startTime);
      const outName = `clip_out_${i}.${outExt}`;

      onProgress({
        status: 'processing',
        message: `Exporting "${clip.label}" (${i + 1} of ${activeClips.length})...`,
        currentClipIndex: i + 1,
        totalClips: activeClips.length,
        clipPercent: 0,
        overallPercent: Math.round((i / activeClips.length) * 88 + 6),
        usedReencode: mustReencode,
      });

      let done = false;
      if (!mustReencode && outExt === 'mp4') {
        const exitCode = await ff.exec([
          '-ss',
          clip.startTime.toFixed(3),
          '-t',
          clipDur.toFixed(3),
          '-i',
          inputName,
          '-c',
          'copy',
          '-avoid_negative_ts',
          'make_zero',
          '-movflags',
          '+faststart',
          '-y',
          outName,
        ]);
        if (exitCode === 0) {
          try {
            const checkRaw = await ff.readFile(outName);
            const len = checkRaw instanceof Uint8Array ? checkRaw.length : checkRaw.length;
            if (len > 1024) {
              done = true;
            }
          } catch {
            done = false;
          }
        }
      }

      if (!done) {
        await encodeClipToFile({
          ff,
          inputName,
          bgAudioInputName,
          outName,
          source,
          clip,
          clipIndex: i,
          totalClips: activeClips.length,
          transform,
          overlay,
          subtitles,
          audio,
          playback,
          exportSettings,
        });
      }

      const raw = await ff.readFile(outName);
      const bytes = raw instanceof Uint8Array ? new Uint8Array(raw) : new TextEncoder().encode(raw);
      await ff.deleteFile(outName).catch(() => undefined);

      const safeLabel = sanitizeFilename(clip.label);
      const baseClipName = exportedItems.some((f) => f.filename === `${safeLabel}.${outExt}`)
        ? `${safeLabel}_${i + 1}`
        : safeLabel;

      exportedItems.push({
        filename: `${baseClipName}.${outExt}`,
        bytes,
        mime: mimeByFormat[outExt],
      });

      // Companion Sliced SRT per clip
      if (subtitles.cues.length > 0 && subtitles.includeSlicedSrt) {
        const sliced = sliceCuesForClip(
          subtitles.cues,
          clip.startTime,
          clip.endTime,
          playback.speed
        );
        if (sliced.length > 0) {
          exportedItems.push({
            filename: `${baseClipName}.srt`,
            bytes: new TextEncoder().encode(serializeCuesToSrt(sliced)),
            mime: 'text/plain',
          });
        }
      }

      // Companion Cover JPG per clip
      if (exportSettings.includeCoverImages && outExt !== 'mp3' && outExt !== 'wav') {
        const coverOut = `cover_${i}.jpg`;
        const midTime = clip.startTime + Math.min(0.5, clipDur * 0.25);
        const coverCode = await ff.exec([
          '-ss',
          midTime.toFixed(3),
          '-i',
          inputName,
          '-frames:v',
          '1',
          '-q:v',
          '3',
          '-y',
          coverOut,
        ]);
        if (coverCode === 0) {
          const coverRaw = await ff.readFile(coverOut);
          const coverBytes =
            coverRaw instanceof Uint8Array
              ? new Uint8Array(coverRaw)
              : new TextEncoder().encode(coverRaw);
          exportedItems.push({
            filename: `${baseClipName}_cover.jpg`,
            bytes: coverBytes,
            mime: 'image/jpeg',
          });
          await ff.deleteFile(coverOut).catch(() => undefined);
        }
      }
    }

    let downloadUrl: string;
    let downloadFilename: string;

    if (exportedItems.length === 1) {
      const single = exportedItems[0];
      downloadUrl = URL.createObjectURL(new Blob([new Uint8Array(single.bytes)], { type: single.mime }));
      downloadFilename = single.filename;
    } else {
      onProgress({
        status: 'packaging',
        message: `Packaging ${exportedItems.length} files into ZIP archive...`,
        currentClipIndex: activeClips.length,
        totalClips: activeClips.length,
        clipPercent: 100,
        overallPercent: 96,
        usedReencode: mustReencode,
      });

      const zip = new JSZip();
      for (const item of exportedItems) {
        zip.file(item.filename, item.bytes);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadUrl = URL.createObjectURL(zipBlob);
      const base = sanitizeFilename(source.name.replace(/\.[^/.]+$/, ''));
      downloadFilename = `${base}_${activeClips.length}_clips.zip`;
    }

    return {
      status: 'done',
      message:
        exportedItems.length === 1
          ? `Exported ${downloadFilename}`
          : `Exported ${activeClips.length} clips (${exportedItems.length} files) in ${downloadFilename}`,
      currentClipIndex: activeClips.length,
      totalClips: activeClips.length,
      clipPercent: 100,
      overallPercent: 100,
      usedReencode: mustReencode,
      format: exportSettings.format,
      downloadUrl,
      downloadFilename,
    };
  } finally {
    ff.off('progress', progressHandler);
    await ff.deleteFile(inputName).catch(() => undefined);
    if (bgAudioInputName) {
      await ff.deleteFile(bgAudioInputName).catch(() => undefined);
    }
  }
}

export function triggerBrowserDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
