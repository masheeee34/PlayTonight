// ============================================================================
//  PlayTonight — ÉTAPE 2/2 : voix de narration + montage TikTok (edge-tts + ffmpeg)
// ----------------------------------------------------------------------------
//  Lit output/raw.webm + output/timeline.json + narration.json, génère une
//  voix off de narration, puis monte une vidéo verticale 1080x1920
//  (cartes plein écran, sous-titres animés, coupes sèches, voix synchro).
//
//  Sortie :  output/playtonight-tiktok.mp4
//  Lancement :  npm run build   (ou : npm run make  pour tout enchaîner)
// ============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'output');
const BIN = join(__dir, 'bin');
const FFMPEG = join(BIN, 'ffmpeg.exe');
const FFPROBE = join(BIN, 'ffprobe.exe');

// Canevas TikTok
const W = 1080, H = 1920;
const CARD_W = 1000;                 // largeur de la carte (démo) dans le canevas
const CARD_H = 624;                   // hauteur de la carte (ratio 1440x900, pair)
const CARD_Y = 560;                  // position verticale de la carte
const CAPTION_Y = 250;               // position verticale du sous-titre
const BG = '0x0f172a';               // fond bleu nuit (couleur de l'app)
const ACCENT = '0x818cf8';           // indigo clair

const toFF = (p) => p.replace(/\\/g, '/'); // chemin -> slashes pour ffmpeg

// Police (gras) : Segoe UI Bold sinon Arial Bold
const FONT = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf']
  .find((f) => existsSync(f)) || 'C:/Windows/Fonts/arial.ttf';

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  return r;
}

function ffprobeDuration(file) {
  const r = sh(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat((r.stdout || '').trim());
}

function makeVoice(text, outFile, voice, rate) {
  const txt = join(OUT, 'vo_input.txt');
  writeFileSync(txt, text, 'utf8');
  const r = sh('edge-tts', ['-f', txt, '--voice', voice, '--rate', rate, '--write-media', outFile], { shell: true });
  if (!existsSync(outFile)) {
    throw new Error(`edge-tts a échoué:\n${r.stdout}\n${r.stderr}`);
  }
}

function buildSegment(i, seg, win, voDur) {
  const rawv = toFF(join(OUT, 'raw.webm'));
  const vo = toFF(join(OUT, `vo_${seg.id}.mp3`));
  const capFile = join(OUT, `cap_${seg.id}.txt`);
  writeFileSync(capFile, seg.caption.replace(/\\n/g, '\n'), 'utf8');
  const cap = toFF(capFile);
  // ffmpeg a 2 niveaux d'échappement (filtergraph + option drawtext) -> double backslash
  const fontE = FONT.replace(/:/g, '\\\\:');
  const capE = cap.replace(/:/g, '\\\\:');
  const outSeg = join(OUT, `seg_${String(i).padStart(2, '0')}.mp4`);

  // Alternance de zoom pour un effet "tac-tac" (coupes dynamiques)
  const zoom = i % 2 === 0 ? 1.0 : 1.06;
  const scaledW = Math.round(CARD_W * zoom);

  const filter = [
    // 1) fenêtre vidéo -> largeur carte, prolongée (dernière image figée) puis coupée à la durée de la voix
    `[0:v]trim=start=${win.from}:end=${win.to},setpts=PTS-STARTPTS,fps=30,` +
      `scale=${scaledW}:-2,setsar=1,crop=${CARD_W}:${CARD_H}:(iw-${CARD_W})/2:(ih-${CARD_H})/2,` +
      `tpad=stop_mode=clone:stop_duration=20,trim=0:${voDur.toFixed(3)},setpts=PTS-STARTPTS[card]`,
    // 2) fond
    `color=c=${BG}:s=${W}x${H}:r=30:d=${voDur.toFixed(3)}[bg]`,
    // 3) carte centrée
    `[bg][card]overlay=(W-w)/2:${CARD_Y}[ov]`,
    // 4) sous-titre (pop-in) + marque en bas
    `[ov]drawtext=fontfile=${fontE}:textfile=${capE}:fontcolor=white:fontsize=76:` +
      `line_spacing=12:text_align=C:x=(w-text_w)/2:y=${CAPTION_Y}:` +
      `shadowcolor=black@0.75:shadowx=3:shadowy=4:alpha=min(1\\,t/0.16),` +
      `drawtext=fontfile=${fontE}:text=play-tonight.vercel.app:fontcolor=${ACCENT}:fontsize=36:` +
      `x=(w-text_w)/2:y=1590:shadowcolor=black@0.6:shadowx=2:shadowy=2[v]`
  ].join(';');

  const r = sh(FFMPEG, [
    '-y', '-i', rawv, '-i', vo,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a',
    '-t', voDur.toFixed(3),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    outSeg
  ]);
  if (!existsSync(outSeg)) throw new Error(`ffmpeg segment ${seg.id} a échoué:\n${r.stderr}`);
  return outSeg;
}

function main() {
  if (!existsSync(join(OUT, 'raw.webm'))) throw new Error('output/raw.webm manquant. Lance d\'abord : npm run record');
  const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
  const narration = JSON.parse(readFileSync(join(__dir, 'narration.json'), 'utf8'));
  // La webm de Playwright n'expose pas toujours sa durée -> on se base sur la timeline.
  let totalRaw = ffprobeDuration(join(OUT, 'raw.webm'));
  if (!isFinite(totalRaw)) totalRaw = Math.max(...Object.values(timeline)) / 1000 + 1;
  mkdirSync(OUT, { recursive: true });

  console.log(`\n🎙  Génération de la voix (${narration.voice}, ${narration.rate})…`);
  const segFiles = [];

  narration.segments.forEach((seg, i) => {
    // fenêtre vidéo de ce segment (secondes)
    let from = (timeline[seg.from] ?? 0) / 1000;
    let to = (timeline[seg.to] ?? totalRaw * 1000) / 1000;
    if (!(to > from)) to = from + 0.6;
    to = Math.min(to, totalRaw);

    const voFile = join(OUT, `vo_${seg.id}.mp3`);
    makeVoice(seg.voice, voFile, narration.voice, narration.rate);
    const voDur = ffprobeDuration(voFile) + 0.35; // petit silence de respiration
    console.log(`  · ${seg.id.padEnd(7)} vidéo[${from.toFixed(2)}→${to.toFixed(2)}]  voix ${voDur.toFixed(2)}s`);

    segFiles.push(buildSegment(i, seg, { from, to }, voDur));
  });

  // Concaténation
  console.log('\n🎬 Assemblage des segments…');
  const listFile = join(OUT, 'concat.txt');
  writeFileSync(listFile, segFiles.map((f) => `file '${toFF(f)}'`).join('\n'), 'utf8');

  const noMusic = join(OUT, '_nomusic.mp4');
  let r = sh(FFMPEG, [
    '-y', '-f', 'concat', '-safe', '0', '-i', toFF(listFile),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', noMusic
  ]);
  if (!existsSync(noMusic)) throw new Error(`Concat échoué:\n${r.stderr}`);

  // Musique de fond optionnelle (dépose demo/music.mp3)
  const music = join(__dir, 'music.mp3');
  const finalOut = join(OUT, 'playtonight-tiktok.mp4');
  if (existsSync(music)) {
    console.log('🎵 Ajout de la musique de fond (music.mp3)…');
    r = sh(FFMPEG, [
      '-y', '-i', toFF(noMusic), '-stream_loop', '-1', '-i', toFF(music),
      '-filter_complex', '[1:a]volume=0.16[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
      '-movflags', '+faststart', finalOut
    ]);
    if (!existsSync(finalOut)) throw new Error(`Mix musique échoué:\n${r.stderr}`);
  } else {
    rmSync(finalOut, { force: true });
    sh(FFMPEG, ['-y', '-i', toFF(noMusic), '-c', 'copy', '-movflags', '+faststart', finalOut]);
    console.log('ℹ️  Pas de musique (dépose demo/music.mp3 pour en ajouter une).');
  }

  // Nettoyage des fichiers intermédiaires
  for (const f of [...segFiles, noMusic, listFile, join(OUT, 'vo_input.txt'),
    ...narration.segments.map((s) => join(OUT, `cap_${s.id}.txt`))]) {
    rmSync(f, { force: true });
  }

  const dur = ffprobeDuration(finalOut);
  console.log(`\n✅ Vidéo TikTok prête (${dur.toFixed(1)}s) :\n   ${finalOut}`);
}

main();
