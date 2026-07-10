# 🎬 Générateur de vidéo TikTok — PlayTonight

Produit **automatiquement** une vidéo pub verticale **1080×1920** (format TikTok /
Reels / Shorts) de [play-tonight.vercel.app](https://play-tonight.vercel.app/) :
enregistrement auto de la démo + **voix off féminine** + montage rythmé
(cartes plein écran, sous-titres qui pop, coupes sèches « tac-tac »).

👉 **Résultat final : `output/playtonight-tiktok.mp4`**

## Comment ça marche (2 étapes)

| Étape | Script | Ce qu'elle fait |
|---|---|---|
| 1 | `npm run record` | Ouvre le site (headless), joue la démo rapide, s'enregistre → `output/raw.webm` + `output/timeline.json` |
| 2 | `npm run build` | Génère la voix (edge-tts) + monte la vidéo verticale (ffmpeg) → `output/playtonight-tiktok.mp4` |
| — | `npm run make` | Fait **les deux** d'affilée |

## Lancer

```powershell
cd C:\Users\Aymane\Desktop\rockstar\demo
npm run make
```

Puis ouvre `output/playtonight-tiktok.mp4` et poste-la sur TikTok / Insta / YouTube Shorts.

> ⚙️ Tout est déjà installé sur cette machine (Playwright + Chromium dans
> `node_modules`, ffmpeg dans `bin/`, edge-tts via pip). Sur une **autre**
> machine : `npm install` (Playwright), `pip install edge-tts`, et garde le
> dossier `bin/` (ffmpeg portable).

## Personnaliser

- **Les profils Steam** → en haut de [`demo.mjs`](demo.mjs) (`STEAM_PROFILE_1/2`).
  ⚠️ Les deux profils doivent avoir leurs *Game Details* en **Public**.
- **Le texte parlé + les sous-titres** → [`narration.json`](narration.json)
  (une entrée par segment : `voice` = ce qui est dit, `caption` = le texte à
  l'écran, `\n` = saut de ligne).
- **La voix** → champ `voice` de `narration.json`. Quelques voix FR féminines :
  `fr-FR-EloiseNeural` (jeune, énergique — par défaut), `fr-FR-DeniseNeural`
  (plus posée), `fr-FR-VivienneMultilingualNeural`. Vitesse via `rate`
  (ex. `+20%` plus rapide). Lister toutes les voix : `edge-tts --list-voices`.
- **Le rythme de la démo** → objet `PACE` dans `demo.mjs`.
- **Musique de fond** (optionnel) → dépose un fichier `music.mp3` dans le dossier
  `demo/` : il sera mixé en fond automatiquement au prochain `npm run build`.
  (Musiques libres : Pixabay Music, YouTube Audio Library.)

## Fichiers

```
demo/
├─ demo.mjs          ← étape 1 : enregistrement Playwright
├─ build-video.mjs   ← étape 2 : voix + montage ffmpeg
├─ narration.json    ← script parlé + sous-titres
├─ bin/              ← ffmpeg / ffprobe portables
├─ music.mp3         ← (optionnel) musique de fond
└─ output/
   ├─ raw.webm                 ← démo brute
   ├─ timeline.json            ← minutage des étapes
   └─ playtonight-tiktok.mp4   ← 🎯 la vidéo finale
```
