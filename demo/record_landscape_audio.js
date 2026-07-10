import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Launching browser for Landscape 16:9 recording (1920x1080)...');
  
  const videoDir = path.join(__dirname, 'videos_landscape');
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir);
  } else {
    fs.readdirSync(videoDir).forEach(file => {
      try { fs.unlinkSync(path.join(videoDir, file)); } catch (e) {}
    });
  }

  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // High-DPI clear rendering
    bypassCSP: true,
    recordVideo: {
      dir: videoDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  // Setup Steam Mock API interception
  await page.route('**/api/games', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          { steamId: "1", displayName: "Aymn", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=aymn" },
          { steamId: "2", displayName: "Wednesday", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=wednesday" }
        ],
        games: [
          { appId: 108600, name: "Project Zomboid", coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/108600/header.jpg", playtimes: { "1": 35000, "2": 0 }, categories: ["Co-op", "Zombies"] },
          { appId: 730, name: "Counter-Strike 2", coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg", playtimes: { "1": 120000, "2": 45000 }, categories: ["Multiplayer", "Co-op"] },
          { appId: 440900, name: "Conan Exiles", coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440900/header.jpg", playtimes: { "1": 15000, "2": 10000 }, categories: ["Co-op", "Survival"] }
        ],
        badges: { "1": "The Tryhard", "2": "The Casual" },
        missingLinkGames: [
          { appId: 108600, name: "Project Zomboid", coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/108600/header.jpg", playtimes: { "1": 35000 }, categories: ["Co-op", "Zombies"], missingUsers: [{ "steamId": "2", "displayName": "Wednesday" }], price: { "final_formatted": "$19.99" } }
        ],
        remotePlayGames: [
          { appId: 440900, name: "Conan Exiles", coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440900/header.jpg", playtimes: { "1": 15000 }, categories: ["Co-op", "Survival"] }
        ]
      })
    });
  });

  const fileUrl = 'file://' + path.resolve(__dirname, '../public/promo_animation.html').replace(/\\/g, '/');
  console.log(`Loading: ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'load' });

  // Wait for frame
  const frameElement = await page.waitForSelector('iframe#site-frame');
  const frame = await frameElement.contentFrame();

  // Hide scrollbars
  await frame.addStyleTag({ content: `
    *::-webkit-scrollbar { display: none !important; }
    * { scrollbar-width: none !important; }
  ` });

  console.log('Running landscape animation timeline...');

  // --- TIMELINE RUN ---

  // 1. Hook
  await page.evaluate(() => window.setSlide(0));
  await delay(1800);

  // 2. Add friends
  await page.evaluate(() => window.setSlide(1));
  const addFriendsSelector = 'div.cursor-pointer.group';
  await frame.waitForSelector(addFriendsSelector);
  await frame.click(addFriendsSelector, { force: true });
  await delay(400);

  const inputs = await frame.$$('input[placeholder="Steam URL or Username"]');
  if (inputs.length >= 2) {
    await inputs[0].fill('aymn');
    await delay(200);
    await inputs[1].fill('wednesday');
    await delay(300);
  }

  await frame.evaluate(() => {
    const scanBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Scan Games'));
    if (scanBtn) scanBtn.click();
  });
  await delay(1000);

  // 3. Boom
  await page.evaluate(() => window.setSlide(2));
  await delay(2500);

  // 4. Shame
  await page.evaluate(() => window.setSlide(3));
  await frame.evaluate(() => {
    const shameTabBtn = document.querySelectorAll('div.flex-col.gap-4.w-full.px-4 button')[1];
    if (shameTabBtn) shameTabBtn.click();
  });
  await delay(2500);

  // 5. Missing link
  await page.evaluate(() => window.setSlide(4));
  await frame.evaluate(() => {
    const libTabBtn = document.querySelectorAll('div.flex-col.gap-4.w-full.px-4 button')[0];
    if (libTabBtn) libTabBtn.click();
  });
  await delay(2500);

  // 6. Roulette
  await page.evaluate(() => window.setSlide(5));
  await frame.evaluate(() => {
    const rouletteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pick for us'));
    if (rouletteBtn) rouletteBtn.click();
  });
  await delay(4000);

  // 7. Outro
  await page.evaluate(() => window.setSlide(6));
  await page.evaluate(() => window.scaleOut());
  await delay(3000);

  // Close context to write native WebM recording file to disk
  await context.close();
  await browser.close();

  // Find the video file Playwright wrote
  const files = fs.readdirSync(videoDir);
  const webmFile = files.find(f => f.endsWith('.webm'));
  
  if (!webmFile) {
    console.error('Error: Playwright landscape video recording not found.');
    return;
  }

  const inputWebmPath = path.join(videoDir, webmFile);
  const finalOutputPath = path.join(__dirname, '../public/promo_video_16_9.mp4');
  const userAudioPath = path.join(__dirname, '../public/promo_video.mov');
  const ffmpegPath = path.join(__dirname, 'bin/ffmpeg.exe');

  console.log(`WebM video saved at: ${inputWebmPath}`);
  console.log('Merging landscape WebM video and user downloads voiceover MOV file into final MP4...');

  // Since promo_video.mov has no audio track, we fall back to adding a silent audio track
  const ffmpeg = spawn(ffmpegPath, [
    '-y',
    '-i', inputWebmPath,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    finalOutputPath
  ]);

  ffmpeg.on('close', (code) => {
    console.log(`FFMPEG landscape merge completed with code ${code}`);
    try {
      fs.unlinkSync(inputWebmPath);
      fs.rmdirSync(videoDir);
    } catch(e) {}
    console.log('Smooth 16:9 landscape promo video with audio saved in public/promo_video_16_9.mp4');
  });
})();
