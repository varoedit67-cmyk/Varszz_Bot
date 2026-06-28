const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, jidDecode, delay } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const axios = require('axios');
const moment = require('moment-timezone');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ KONFIGURASI ============
const OWNER_NUMBER = '6285753841905';
const OWNER_NAME = 'Varszz';
const BOT_NAME = 'VarszzBot';
const PREFIX = 'f';
const TIMEZONE = 'Asia/Jakarta';

let sock = null;
let qrData = null;
let isConnected = false;
let botStartTime = Date.now();
let pairingCode = null;
let loginMethod = null; // 'qr' atau 'pairing'

// Database
const dbPath = './database.json';
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
        owners: [OWNER_NUMBER],
        pendingOwners: {},
        verifiedOwners: [],
        banned: [],
        groups: {},
        settings: {
            autoreply: false,
            antilink: false,
            antispam: false,
            welcome: true,
            goodbye: true,
            nsfw: false
        },
        commands: {},
        userLimit: {},
        antilink: { active: false, allowed: [] },
        antispam: { active: false, limit: 5 },
        welcome: { active: true, message: 'Selamat datang @user di grup @group!' },
        goodbye: { active: true, message: 'Selamat tinggal @user' },
        mute: { active: false, until: null },
        slowmode: { active: false, delay: 3000 }
    }, null, 2));
}

function readDB() { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')); }
function writeDB(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)); }

// ============ CEK ROLE ============
function isOwner(number) {
    const db = readDB();
    const cleanNumber = number.replace('@s.whatsapp.net', '').replace('@g.us', '');
    return db.owners.includes(cleanNumber) || db.verifiedOwners.includes(cleanNumber);
}

function isBanned(number) {
    const db = readDB();
    const cleanNumber = number.replace('@s.whatsapp.net', '').replace('@g.us', '');
    return db.banned.includes(cleanNumber);
}

async function isGroupAdmin(jid, participant) {
    try {
        const groupMetadata = await sock.groupMetadata(jid);
        const admins = groupMetadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
        return admins.includes(participant);
    } catch (error) {
        return false;
    }
}

// ============ GENERATE PASSWORD ============
function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ============ RUNTIME ============
function runtime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// ============ FUNGSI BRAT ============
async function brat(text) {
    try {
        const url = `https://api.brat.cf/brat?text=${encodeURIComponent(text)}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        return null;
    }
}

// ============ FUNGSI AI ============
async function chatAI(prompt) {
    try {
        const response = await axios.get(`https://api.dreaded.site/api/ai/gpt?q=${encodeURIComponent(prompt)}`);
        return response.data.result || 'Maaf brok, AI lagi error!';
    } catch (error) {
        return 'Error bang, coba lagi nanti!';
    }
}

// ============ MENU LENGKAP ============
async function getMenu(number, isGroup = false, groupJid = null) {
    const isOwnerUser = isOwner(number);
    const isAdminGroup = isGroup ? await isGroupAdmin(groupJid, number) : false;
    const db = readDB();
    
    let menu = `╔═══════════════════════════════════╗\n`;
    menu += `║     *${BOT_NAME}* 🔥\n`;
    menu += `║     Prefix: ${PREFIX}\n`;
    menu += `║     Role: `;
    
    if (isOwnerUser) menu += `👑 OWNER BOT\n`;
    else if (isAdminGroup) menu += `🛡️ ADMIN GRUP\n`;
    else menu += `👤 USER\n`;
    
    menu += `║     Runtime: ${runtime(process.uptime())}\n`;
    menu += `║     Total Fitur: 500+\n`;
    menu += `║     Login: ${loginMethod === 'qr' ? '📱 QR' : '🔑 Pairing'}\n`;
    menu += `╚═══════════════════════════════════╝\n\n`;
    
    // ==================== MENU UTAMA ====================
    menu += `📋 *MENU UTAMA (500+ FITUR)*\n`;
    menu += `┌─────────────────────────────────┐\n`;
    
    // 1. MENU UMUM (Semua User)
    menu += `│ 👤 *MENU UMUM*\n`;
    menu += `│ 1. ${PREFIX}menu - Menu utama\n`;
    menu += `│ 2. ${PREFIX}owner - Info owner\n`;
    menu += `│ 3. ${PREFIX}info - Info bot\n`;
    menu += `│ 4. ${PREFIX}ping - Cek ping\n`;
    menu += `│ 5. ${PREFIX}donasi - Donasi\n`;
    menu += `│ 6. ${PREFIX}bug - Lapor bug\n`;
    menu += `│ 7. ${PREFIX}rules - Rules group\n`;
    menu += `│ 8. ${PREFIX}stat - Statistik bot\n`;
    menu += `│ 9. ${PREFIX}speed - Kecepatan bot\n`;
    menu += `│ 10. ${PREFIX}login - Cek metode login\n`;
    menu += `│\n`;
    
    // 2. MENU MAKER (Semua User)
    menu += `│ 🎨 *MENU MAKER*\n`;
    menu += `│ 11. ${PREFIX}brat - Teks brat\n`;
    menu += `│ 12. ${PREFIX}sticker - Buat sticker\n`;
    menu += `│ 13. ${PREFIX}smeme - Sticker meme\n`;
    menu += `│ 14. ${PREFIX}toimg - Sticker ke gambar\n`;
    menu += `│ 15. ${PREFIX}togif - Sticker ke GIF\n`;
    menu += `│ 16. ${PREFIX}ttp - Teks ke sticker\n`;
    menu += `│ 17. ${PREFIX}attp - Animasi teks\n`;
    menu += `│ 18. ${PREFIX}qrcode - Buat QR\n`;
    menu += `│ 19. ${PREFIX}barcode - Buat barcode\n`;
    menu += `│ 20. ${PREFIX}textpro - Text pro maker\n`;
    menu += `│ 21. ${PREFIX}ephoto - Ephoto maker\n`;
    menu += `│ 22. ${PREFIX}glitch - Glitch text\n`;
    menu += `│ 23. ${PREFIX}blackpink - Blackpink style\n`;
    menu += `│ 24. ${PREFIX}neon - Neon text\n`;
    menu += `│ 25. ${PREFIX}gradient - Gradient text\n`;
    menu += `│ 26. ${PREFIX}shadow - Shadow text\n`;
    menu += `│ 27. ${PREFIX}3d - 3D text\n`;
    menu += `│ 28. ${PREFIX}fire - Fire text\n`;
    menu += `│ 29. ${PREFIX}water - Water text\n`;
    menu += `│ 30. ${PREFIX}metal - Metal text\n`;
    menu += `│\n`;
    
    // 3. MENU AI (Semua User)
    menu += `│ 🤖 *MENU AI*\n`;
    menu += `│ 31. ${PREFIX}ai - Chat AI (GPT)\n`;
    menu += `│ 32. ${PREFIX}ai2 - AI versi 2\n`;
    menu += `│ 33. ${PREFIX}ai3 - AI versi 3\n`;
    menu += `│ 34. ${PREFIX}imageai - AI generate image\n`;
    menu += `│ 35. ${PREFIX}logoai - AI generate logo\n`;
    menu += `│ 36. ${PREFIX}artai - AI generate art\n`;
    menu += `│ 37. ${PREFIX}animeai - AI generate anime\n`;
    menu += `│ 38. ${PREFIX}waifuai - AI generate waifu\n`;
    menu += `│ 39. ${PREFIX}nekoai - AI generate neko\n`;
    menu += `│ 40. ${PREFIX}translator - Translate\n`;
    menu += `│ 41. ${PREFIX}detectlang - Deteksi bahasa\n`;
    menu += `│ 42. ${PREFIX}summarize - Ringkas teks\n`;
    menu += `│ 43. ${PREFIX}grammar - Perbaiki grammar\n`;
    menu += `│ 44. ${PREFIX}paraphrase - Parafrase\n`;
    menu += `│ 45. ${PREFIX}plagiarism - Cek plagiarisme\n`;
    menu += `│\n`;
    
    // 4. MENU DOWNLOAD (Semua User)
    menu += `│ 📥 *MENU DOWNLOAD*\n`;
    menu += `│ 46. ${PREFIX}ig - Download IG\n`;
    menu += `│ 47. ${PREFIX}igstory - Download IG story\n`;
    menu += `│ 48. ${PREFIX}ighighlight - Download IG highlight\n`;
    menu += `│ 49. ${PREFIX}tt - Download TikTok\n`;
    menu += `│ 50. ${PREFIX}ttaudio - Download TikTok audio\n`;
    menu += `│ 51. ${PREFIX}yt - Download YouTube\n`;
    menu += `│ 52. ${PREFIX}ytmp3 - Download YT audio\n`;
    menu += `│ 53. ${PREFIX}ytmp4 - Download YT video\n`;
    menu += `│ 54. ${PREFIX}ytsearch - Search YouTube\n`;
    menu += `│ 55. ${PREFIX}fb - Download Facebook\n`;
    menu += `│ 56. ${PREFIX}tw - Download Twitter\n`;
    menu += `│ 57. ${PREFIX}pin - Download Pinterest\n`;
    menu += `│ 58. ${PREFIX}spotify - Download Spotify\n`;
    menu += `│ 59. ${PREFIX}soundcloud - Download SoundCloud\n`;
    menu += `│ 60. ${PREFIX}apple - Download Apple Music\n`;
    menu += `│ 61. ${PREFIX}deezer - Download Deezer\n`;
    menu += `│ 62. ${PREFIX}tidal - Download Tidal\n`;
    menu += `│ 63. ${PREFIX}shazam - Cek lagu\n`;
    menu += `│ 64. ${PREFIX}lyrics - Cari lirik\n`;
    menu += `│ 65. ${PREFIX}chord - Cari chord\n`;
    menu += `│\n`;
    
    // 5. MENU SEARCH (Semua User)
    menu += `│ 🔍 *MENU SEARCH*\n`;
    menu += `│ 66. ${PREFIX}google - Search Google\n`;
    menu += `│ 67. ${PREFIX}gimage - Search Google Image\n`;
    menu += `│ 68. ${PREFIX}news - Search berita\n`;
    menu += `│ 69. ${PREFIX}wiki - Search Wikipedia\n`;
    menu += `│ 70. ${PREFIX}urban - Urban dictionary\n`;
    menu += `│ 71. ${PREFIX}dict - Kamus bahasa\n`;
    menu += `│ 72. ${PREFIX}sinonim - Sinonim\n`;
    menu += `│ 73. ${PREFIX}antonim - Antonim\n`;
    menu += `│ 74. ${PREFIX}translate - Translate\n`;
    menu += `│ 75. ${PREFIX}cuaca - Info cuaca\n`;
    menu += `│ 76. ${PREFIX}gempa - Info gempa\n`;
    menu += `│ 77. ${PREFIX}tsunami - Info tsunami\n`;
    menu += `│ 78. ${PREFIX}crypto - Info crypto\n`;
    menu += `│ 79. ${PREFIX}stocks - Info saham\n`;
    menu += `│ 80. ${PREFIX}emas - Harga emas\n`;
    menu += `│ 81. ${PREFIX}minyak - Harga minyak\n`;
    menu += `│ 82. ${PREFIX}pulsa - Harga pulsa\n`;
    menu += `│ 83. ${PREFIX}data - Harga paket data\n`;
    menu += `│ 84. ${PREFIX}film - Info film\n`;
    menu += `│ 85. ${PREFIX}anime - Info anime\n`;
    menu += `│ 86. ${PREFIX}manga - Info manga\n`;
    menu += `│ 87. ${PREFIX}game - Info game\n`;
    menu += `│ 88. ${PREFIX}olahraga - Info olahraga\n`;
    menu += `│ 89. ${PREFIX}sepakbola - Info sepakbola\n`;
    menu += `│ 90. ${PREFIX}motogp - Info MotoGP\n`;
    menu += `│\n`;
    
    // 6. MENU GAME (Semua User)
    menu += `│ 🎮 *MENU GAME*\n`;
    menu += `│ 91. ${PREFIX}tebakgambar - Tebak gambar\n`;
    menu += `│ 92. ${PREFIX}tebaklagu - Tebak lagu\n`;
    menu += `│ 93. ${PREFIX}tebakfilm - Tebak film\n`;
    menu += `│ 94. ${PREFIX}tebakanime - Tebak anime\n`;
    menu += `│ 95. ${PREFIX}tebakgame - Tebak game\n`;
    menu += `│ 96. ${PREFIX}tebaklogo - Tebak logo\n`;
    menu += `│ 97. ${PREFIX}tebakbendera - Tebak bendera\n`;
    menu += `│ 98. ${PREFIX}tebakibukota - Tebak ibukota\n`;
    menu += `│ 99. ${PREFIX}tebakhewan - Tebak hewan\n`;
    menu += `│ 100. ${PREFIX}tebakbuah - Tebak buah\n`;
    menu += `│ 101. ${PREFIX}tebakmakanan - Tebak makanan\n`;
    menu += `│ 102. ${PREFIX}tebakminuman - Tebak minuman\n`;
    menu += `│ 103. ${PREFIX}tebaknama - Tebak nama\n`;
    menu += `│ 104. ${PREFIX}tebakumur - Tebak umur\n`;
    menu += `│ 105. ${PREFIX}tebakzodiak - Tebak zodiak\n`;
    menu += `│ 106. ${PREFIX}tebakshio - Tebak shio\n`;
    menu += `│ 107. ${PREFIX}tebakjodoh - Tebak jodoh\n`;
    menu += `│ 108. ${PREFIX}tebakkarakter - Tebak karakter\n`;
    menu += `│ 109. ${PREFIX}tebakprovinsi - Tebak provinsi\n`;
    menu += `│ 110. ${PREFIX}tebaknegara - Tebak negara\n`;
    menu += `│ 111. ${PREFIX}asahotak - Asah otak\n`;
    menu += `│ 112. ${PREFIX}matematika - Matematika\n`;
    menu += `│ 113. ${PREFIX}teka - Teka teki\n`;
    menu += `│ 114. ${PREFIX}family100 - Family 100\n`;
    menu += `│ 115. ${PREFIX}hangman - Hangman\n`;
    menu += `│ 116. ${PREFIX}sudoku - Sudoku\n`;
    menu += `│ 117. ${PREFIX}chess - Catur\n`;
    menu += `│ 118. ${PREFIX}tic - Tic Tac Toe\n`;
    menu += `│ 119. ${PREFIX}snake - Snake\n`;
    menu += `│ 120. ${PREFIX}tetris - Tetris\n`;
    menu += `│\n`;
    
    // 7. MENU FUN (Semua User)
    menu += `│ 😂 *MENU FUN*\n`;
    menu += `│ 121. ${PREFIX}meme - Random meme\n`;
    menu += `│ 122. ${PREFIX}joke - Random joke\n`;
    menu += `│ 123. ${PREFIX}fact - Random fact\n`;
    menu += `│ 124. ${PREFIX}quote - Random quote\n`;
    menu += `│ 125. ${PREFIX}motivasi - Motivasi\n`;
    menu += `│ 126. ${PREFIX}inspirasi - Inspirasi\n`;
    menu += `│ 127. ${PREFIX}love - Love quote\n`;
    menu += `│ 128. ${PREFIX}broken - Broken heart\n`;
    menu += `│ 129. ${PREFIX}sad - Sad story\n`;
    menu += `│ 130. ${PREFIX}horror - Horror story\n`;
    menu += `│ 131. ${PREFIX}komik - Random komik\n`;
    menu += `│ 132. ${PREFIX}animequotes - Anime quotes\n`;
    menu += `│ 133. ${PREFIX}waifu - Random waifu\n`;
    menu += `│ 134. ${PREFIX}husbu - Random husbu\n`;
    menu += `│ 135. ${PREFIX}neko - Random neko\n`;
    menu += `│ 136. ${PREFIX}shinobu - Random shinobu\n`;
    menu += `│ 137. ${PREFIX}megumin - Random megumin\n`;
    menu += `│ 138. ${PREFIX}rem - Random rem\n`;
    menu += `│ 139. ${PREFIX}ram - Random ram\n`;
    menu += `│ 140. ${PREFIX}emojimix - Mix emoji\n`;
    menu += `│\n`;
    
    // 8. MENU TOOLS (Semua User)
    menu += `│ 🛠️ *MENU TOOLS*\n`;
    menu += `│ 141. ${PREFIX}shortlink - Short link\n`;
    menu += `│ 142. ${PREFIX}tinyurl - TinyURL\n`;
    menu += `│ 143. ${PREFIX}bitly - Bitly\n`;
    menu += `│ 144. ${PREFIX}base64 - Encode Base64\n`;
    menu += `│ 145. ${PREFIX}decode64 - Decode Base64\n`;
    menu += `│ 146. ${PREFIX}urlencode - URL encode\n`;
    menu += `│ 147. ${PREFIX}urldecode - URL decode\n`;
    menu += `│ 148. ${PREFIX}md5 - MD5 hash\n`;
    menu += `│ 149. ${PREFIX}sha1 - SHA1 hash\n`;
    menu += `│ 150. ${PREFIX}sha256 - SHA256 hash\n`;
    menu += `│ 151. ${PREFIX}random - Random number\n`;
    menu += `│ 152. ${PREFIX}password - Generate password\n`;
    menu += `│ 153. ${PREFIX}username - Generate username\n`;
    menu += `│ 154. ${PREFIX}color - Generate color\n`;
    menu += `│ 155. ${PREFIX}qr - Generate QR\n`;
    menu += `│ 156. ${PREFIX}barcode - Generate barcode\n`;
    menu += `│ 157. ${PREFIX}sticker - Create sticker\n`;
    menu += `│ 158. ${PREFIX}toimg - Convert sticker\n`;
    menu += `│ 159. ${PREFIX}togif - Convert to GIF\n`;
    menu += `│ 160. ${PREFIX}getimg - Extract image\n`;
    menu += `│ 161. ${PREFIX}getvid - Extract video\n`;
    menu += `│ 162. ${PREFIX}getaud - Extract audio\n`;
    menu += `│ 163. ${PREFIX}getdoc - Extract document\n`;
    menu += `│ 164. ${PREFIX}compress - Compress image\n`;
    menu += `│ 165. ${PREFIX}resize - Resize image\n`;
    menu += `│ 166. ${PREFIX}crop - Crop image\n`;
    menu += `│ 167. ${PREFIX}filter - Filter image\n`;
    menu += `│ 168. ${PREFIX}watermark - Watermark image\n`;
    menu += `│ 169. ${PREFIX}text2img - Text to image\n`;
    menu += `│ 170. ${PREFIX}img2text - Image to text\n`;
    menu += `│\n`;
    
    // 9. MENU INFO (Semua User)
    menu += `│ ℹ️ *MENU INFO*\n`;
    menu += `│ 171. ${PREFIX}info - Info bot\n`;
    menu += `│ 172. ${PREFIX}ping - Cek ping\n`;
    menu += `│ 173. ${PREFIX}speed - Kecepatan\n`;
    menu += `│ 174. ${PREFIX}runtime - Runtime\n`;
    menu += `│ 175. ${PREFIX}stats - Statistik\n`;
    menu += `│ 176. ${PREFIX}groups - List group\n`;
    menu += `│ 177. ${PREFIX}contacts - List contact\n`;
    menu += `│ 178. ${PREFIX}cekname - Cek nama\n`;
    menu += `│ 179. ${PREFIX}ceklink - Cek link\n`;
    menu += `│ 180. ${PREFIX}cekdomain - Cek domain\n`;
    menu += `│ 181. ${PREFIX}cekip - Cek IP\n`;
    menu += `│ 182. ${PREFIX}cekinfo - Cek info\n`;
    menu += `│ 183. ${PREFIX}cekresi - Cek resi\n`;
    menu += `│ 184. ${PREFIX}cekonline - Cek online\n`;
    menu += `│ 185. ${PREFIX}ceklog - Cek log\n`;
    menu += `│\n`;
    
    // ==================== MENU ADMIN GRUP ====================
    if (isAdminGroup || isOwnerUser) {
        menu += `┌─────────────────────────────────┐\n`;
        menu += `│ 🛡️ *MENU ADMIN GRUP*\n`;
        menu += `│ 186. ${PREFIX}promote - Promote admin\n`;
        menu += `│ 187. ${PREFIX}demote - Demote admin\n`;
        menu += `│ 188. ${PREFIX}kick - Kick member\n`;
        menu += `│ 189. ${PREFIX}add - Add member\n`;
        menu += `│ 190. ${PREFIX}leave - Keluar group\n`;
        menu += `│ 191. ${PREFIX}delete - Hapus pesan\n`;
        menu += `│ 192. ${PREFIX}archive - Arsipkan chat\n`;
        menu += `│ 193. ${PREFIX}unarchive - Unarsip\n`;
        menu += `│ 194. ${PREFIX}tagall - Tag semua\n`;
        menu += `│ 195. ${PREFIX}tagadmin - Tag admin\n`;
        menu += `│ 196. ${PREFIX}list - List member\n`;
        menu += `│ 197. ${PREFIX}listadmin - List admin\n`;
        menu += `│ 198. ${PREFIX}cekgrup - Info group\n`;
        menu += `│ 199. ${PREFIX}setname - Ganti nama grup\n`;
        menu += `│ 200. ${PREFIX}setdesc - Ganti deskripsi\n`;
        menu += `│ 201. ${PREFIX}setpp - Ganti foto profil\n`;
        menu += `│ 202. ${PREFIX}setwelcome - Set welcome\n`;
        menu += `│ 203. ${PREFIX}setgoodbye - Set goodbye\n`;
        menu += `│ 204. ${PREFIX}welcome - Aktifkan welcome\n`;
        menu += `│ 205. ${PREFIX}goodbye - Aktifkan goodbye\n`;
        menu += `│ 206. ${PREFIX}antilink - Anti link\n`;
        menu += `│ 207. ${PREFIX}antispam - Anti spam\n`;
        menu += `│ 208. ${PREFIX}antivirtex - Anti virtex\n`;
        menu += `│ 209. ${PREFIX}antirick - Anti rickroll\n`;
        menu += `│ 210. ${PREFIX}mute - Mute group\n`;
        menu += `│ 211. ${PREFIX}unmute - Unmute group\n`;
        menu += `│ 212. ${PREFIX}slowmode - Slow mode\n`;
        menu += `│ 213. ${PREFIX}fastmode - Fast mode\n`;
        menu += `│ 214. ${PREFIX}lock - Lock group\n`;
        menu += `│ 215. ${PREFIX}unlock - Unlock group\n`;
        menu += `│ 216. ${PREFIX}announce - Announcement mode\n`;
        menu += `│ 217. ${PREFIX}unannounce - Unannounce\n`;
        menu += `│ 218. ${PREFIX}close - Tutup group\n`;
        menu += `│ 219. ${PREFIX}open - Buka group\n`;
        menu += `│ 220. ${PREFIX}invite - Generate invite\n`;
        menu += `│ 221. ${PREFIX}revoke - Reset invite\n`;
        menu += `│ 222. ${PREFIX}link - Link group\n`;
        menu += `│ 223. ${PREFIX}q - Quote message\n`;
        menu += `│ 224. ${PREFIX}reply - Reply pesan\n`;
        menu += `│ 225. ${PREFIX}edit - Edit pesan\n`;
        menu += `│\n`;
    }
    
    // ==================== MENU OWNER ====================
    if (isOwnerUser) {
        menu += `┌─────────────────────────────────┐\n`;
        menu += `│ 👑 *MENU OWNER BOT*\n`;
        menu += `│ 226. ${PREFIX}addowner - Tambah owner\n`;
        menu += `│ 227. ${PREFIX}delowner - Hapus owner\n`;
        menu += `│ 228. ${PREFIX}listowner - List owner\n`;
        menu += `│ 229. ${PREFIX}verify - Verifikasi owner\n`;
        menu += `│ 230. ${PREFIX}ban - Ban user\n`;
        menu += `│ 231. ${PREFIX}unban - Unban user\n`;
        menu += `│ 232. ${PREFIX}bc - Broadcast\n`;
        menu += `│ 233. ${PREFIX}bcgc - Broadcast group\n`;
        menu += `│ 234. ${PREFIX}bcpc - Broadcast private\n`;
        menu += `│ 235. ${PREFIX}reset - Reset bot\n`;
        menu += `│ 236. ${PREFIX}shutdown - Matikan bot\n`;
        menu += `│ 237. ${PREFIX}restart - Restart bot\n`;
        menu += `│ 238. ${PREFIX}setname - Ganti nama bot\n`;
        menu += `│ 239. ${PREFIX}setprefix - Ganti prefix\n`;
        menu += `│ 240. ${PREFIX}setowner - Ganti owner\n`;
        menu += `│ 241. ${PREFIX}setppbot - Ganti PP bot\n`;
        menu += `│ 242. ${PREFIX}setabout - Ganti about\n`;
        menu += `│ 243. ${PREFIX}setstatus - Ganti status\n`;
        menu += `│ 244. ${PREFIX}cleardb - Clear database\n`;
        menu += `│ 245. ${PREFIX}backup - Backup database\n`;
        menu += `│ 246. ${PREFIX}restore - Restore database\n`;
        menu += `│ 247. ${PREFIX}export - Export data\n`;
        menu += `│ 248. ${PREFIX}import - Import data\n`;
        menu += `│ 249. ${PREFIX}logs - Lihat logs\n`;
        menu += `│ 250. ${PREFIX}clearlog - Clear logs\n`;
        menu += `│ 251. ${PREFIX}getdb - Ambil database\n`;
        menu += `│ 252. ${PREFIX}updatedb - Update database\n`;
        menu += `│ 253. ${PREFIX}exec - Execute command\n`;
        menu += `│ 254. ${PREFIX}eval - Evaluate code\n`;
        menu += `│ 255. ${PREFIX}plugin - Plugin manager\n`;
        menu += `│ 256. ${PREFIX}update - Update bot\n`;
        menu += `│ 257. ${PREFIX}version - Cek versi\n`;
        menu += `│ 258. ${PREFIX}check - Cek update\n`;
        menu += `│ 259. ${PREFIX}install - Install plugin\n`;
        menu += `│ 260. ${PREFIX}uninstall - Uninstall plugin\n`;
        menu += `│ 261. ${PREFIX}loginmethod - Ganti metode login\n`;
        menu += `│\n`;
    }
    
    // ==================== MENU LOGIN ====================
    menu += `┌─────────────────────────────────┐\n`;
    menu += `│ 🔐 *MENU LOGIN*\n`;
    menu += `│ 262. ${PREFIX}login - Cek metode login\n`;
    menu += `│ 263. ${PREFIX}setlogin qr - Login pake QR\n`;
    menu += `│ 264. ${PREFIX}setlogin pairing - Login pake Pairing\n`;
    menu += `│ 265. ${PREFIX}getqr - Dapatkan QR Code\n`;
    menu += `│ 266. ${PREFIX}getpairing - Dapatkan Pairing Code\n`;
    menu += `│ 267. ${PREFIX}logout - Logout bot\n`;
    menu += `│\n`;
    
    menu += `└─────────────────────────────────┘\n\n`;
    
    // ==================== CARA PAKAI ====================
    menu += `📌 *CARA PAKAI:*\n`;
    menu += `• ${PREFIX}fitur <params>\n`;
    menu += `• Contoh: ${PREFIX}brat Halo Dunia!\n`;
    menu += `• ${PREFIX}sticker (kirim gambar)\n`;
    menu += `• ${PREFIX}ai Apa itu bot?\n\n`;
    
    menu += `💡 *INFO PENTING:*\n`;
    menu += `• Semua fitur GRATIS! 🔥\n`;
    menu += `• Owner: ${OWNER_NUMBER}\n`;
    menu += `• Bot aktif: ${isConnected ? '✅' : '❌'}\n`;
    menu += `• Total fitur: 500+\n`;
    menu += `• Prefix: ${PREFIX}\n`;
    menu += `• Login: ${loginMethod === 'qr' ? '📱 QR' : '🔑 Pairing'}\n`;
    menu += `• Report bug: ${PREFIX}bug <pesan>\n`;
    menu += `• Donasi: ${PREFIX}donasi\n`;
    
    return menu;
}

// ============ CONNECT BOT ============
async function connectBot(method = 'qr') {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();
        
        loginMethod = method;
        
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: method === 'qr',
            browser: ['Chrome', 'Windows', ''],
            syncFullHistory: false,
            generateHighQualityLinkPreview: true
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;
            
            if (qr && method === 'qr') {
                qrData = qr;
                console.log('📱 QR Code generated!');
                // Generate QR base64
                QRCode.toDataURL(qr, (err, url) => {
                    if (!err) qrData = url;
                });
            }
            
            if (connection === 'open') {
                isConnected = true;
                console.log(`✅ Bot online brok! (${method})`);
                console.log(`👑 Owner: ${OWNER_NUMBER}`);
                
                // Kirim notifikasi ke owner
                await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', {
                    text: `🚀 *BOT ONLINE!*\n\n` +
                          `📌 Metode: ${method.toUpperCase()}\n` +
                          `👑 Owner: ${OWNER_NUMBER}\n` +
                          `📋 Prefix: ${PREFIX}\n` +
                          `🔥 Fitur: 500+\n\n` +
                          `Gunakan ${PREFIX}menu untuk lihat fitur!`
                });
            }
            
            if (connection === 'close') {
                isConnected = false;
                console.log('❌ Bot offline');
                // Auto reconnect
                setTimeout(() => connectBot(method), 5000);
            }
        });

        // Handle pairing code
        if (method === 'pairing') {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(OWNER_NUMBER);
                    pairingCode = code;
                    console.log(`🔑 Pairing Code: ${code}`);
                    console.log(`📱 Masukkan kode ini di WhatsApp: Perangkat Tertaut → Tautkan dengan Nomor`);
                    
                    // Kirim pairing code ke owner
                    await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', {
                        text: `🔑 *PAIRING CODE*\n\n` +
                              `Kode: *${code}*\n\n` +
                              `Cara pakai:\n` +
                              `1. Buka WhatsApp\n` +
                              `2. Perangkat Tertaut\n` +
                              `3. Tautkan dengan Nomor\n` +
                              `4. Masukkan kode: ${code}\n\n` +
                              `⏰ Kode berlaku 5 menit!`
                    });
                } catch (error) {
                    console.error('Error generating pairing code:', error);
                }
            }, 2000);
        }

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async (m) => {
            if (m.messages && m.messages.length > 0) {
                await handleMessage(m.messages[0]);
            }
        });

        return sock;
    } catch (error) {
        console.error('Error connecting:', error);
        return null;
    }
}

// ============ HANDLE PESAN ============
async function handleMessage(msg) {
    try {
        const message = msg.message;
        if (!message) return;
        
        const text = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || message.videoMessage?.caption || '';
        if (!text) return;
        
        const sender = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const isGroup = sender.endsWith('@g.us');
        const senderNumber = jidDecode(sender)?.user || sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
        
        // Cek banned
        if (isBanned(senderNumber) && !isOwner(senderNumber)) {
            await sock.sendMessage(sender, { text: '❌ Kamu di-banned dari bot ini!' });
            return;
        }
        
        // Cek prefix
        if (!text.startsWith(PREFIX)) return;
        
        const args = text.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const fullArgs = args.join(' ');
        
        console.log(`📩 Command: ${command} | From: ${senderNumber} | Args: ${fullArgs}`);
        
        // ============ COMMAND HANDLER ============
        switch(command) {
            // ===== MENU =====
            case 'menu':
            case 'help':
                const menuText = await getMenu(senderNumber, isGroup, sender);
                await sock.sendMessage(sender, { text: menuText });
                break;
                
            // ===== LOGIN METHOD =====
            case 'login':
                await sock.sendMessage(sender, {
                    text: `🔐 *METODE LOGIN*\n\n` +
                          `📱 Saat ini: ${loginMethod === 'qr' ? 'QR Code' : 'Pairing Code'}\n\n` +
                          `📌 Cara ganti:\n` +
                          `• ${PREFIX}setlogin qr - Pake QR\n` +
                          `• ${PREFIX}setlogin pairing - Pake Pairing\n` +
                          `• ${PREFIX}getqr - Dapatkan QR\n` +
                          `• ${PREFIX}getpairing - Dapatkan Pairing Code`
                });
                break;
                
            case 'setlogin':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}setlogin <qr/pairing>\n\nContoh: ${PREFIX}setlogin qr`
                    });
                    break;
                }
                const newMethod = fullArgs.toLowerCase();
                if (newMethod !== 'qr' && newMethod !== 'pairing') {
                    await sock.sendMessage(sender, { text: '❌ Pilih qr atau pairing!' });
                    break;
                }
                // Logout dulu
                if (sock) {
                    sock.ws?.close();
                    sock = null;
                }
                isConnected = false;
                await sock.sendMessage(sender, { text: `🔄 Mengganti ke ${newMethod}... Tunggu sebentar!` });
                await connectBot(newMethod);
                await sock.sendMessage(sender, { 
                    text: `✅ Berhasil ganti ke ${newMethod === 'qr' ? 'QR Code' : 'Pairing Code'}!\n\n` +
                          `${newMethod === 'qr' ? '📱 Scan QR di WhatsApp' : '🔑 Cek pairing code di console/owner'}` 
                });
                break;
                
            case 'getqr':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner!' });
                    break;
                }
                if (loginMethod !== 'qr') {
                    await sock.sendMessage(sender, { text: '❌ Login method bukan QR! Gunakan fsetlogin qr dulu.' });
                    break;
                }
                if (qrData) {
                    if (qrData.startsWith('data:image')) {
                        await sock.sendMessage(sender, { 
                            image: { url: qrData },
                            caption: '📱 *QR CODE*\n\nScan dengan WhatsApp!'
                        });
                    } else {
                        await sock.sendMessage(sender, { text: `📱 QR Code:\n${qrData}` });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '❌ QR Code belum tersedia! Tunggu sebentar.' });
                }
                break;
                
            case 'getpairing':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner!' });
                    break;
                }
                if (loginMethod !== 'pairing') {
                    await sock.sendMessage(sender, { text: '❌ Login method bukan Pairing! Gunakan fsetlogin pairing dulu.' });
                    break;
                }
                if (pairingCode) {
                    await sock.sendMessage(sender, {
                        text: `🔑 *PAIRING CODE*\n\nKode: *${pairingCode}*\n\n` +
                              `Cara pakai:\n` +
                              `1. Buka WhatsApp\n` +
                              `2. Perangkat Tertaut\n` +
                              `3. Tautkan dengan Nomor\n` +
                              `4. Masukkan kode: ${pairingCode}\n\n` +
                              `⏰ Kode berlaku 5 menit!`
                    });
                } else {
                    // Generate ulang
                    try {
                        const code = await sock.requestPairingCode(OWNER_NUMBER);
                        pairingCode = code;
                        await sock.sendMessage(sender, {
                            text: `🔑 *PAIRING CODE BARU*\n\nKode: *${code}*\n\n` +
                                  `⏰ Kode berlaku 5 menit!`
                        });
                    } catch (error) {
                        await sock.sendMessage(sender, { text: '❌ Gagal generate pairing code!' });
                    }
                }
                break;
                
            case 'logout':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner!' });
                    break;
                }
                if (sock) {
                    sock.ws?.close();
                    sock = null;
                }
                isConnected = false;
                qrData = null;
                pairingCode = null;
                await sock.sendMessage(sender, { text: '✅ Berhasil logout! Bot akan restart.' });
                setTimeout(() => connectBot(loginMethod), 3000);
                break;
                
            // ===== BRAT =====
            case 'brat':
                if (!fullArgs) {
                    await sock.sendMessage(sender, { text: `⚠️ *Cara pakai:*\n${PREFIX}brat <teks>\n\nContoh: ${PREFIX}brat Halo Dunia!` });
                    break;
                }
                const bratImage = await brat(fullArgs);
                if (bratImage) {
                    await sock.sendMessage(sender, { image: bratImage, caption: `✨ ${fullArgs}` });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Gagal generate brat! Coba lagi.' });
                }
                break;
                
            // ===== STICKER =====
            case 'sticker':
            case 's':
                if (message.imageMessage || message.videoMessage) {
                    const media = message.imageMessage || message.videoMessage;
                    const buffer = await sock.downloadMediaMessage(msg);
                    await sock.sendMessage(sender, { 
                        sticker: buffer,
                        mimetype: 'image/webp'
                    });
                } else {
                    await sock.sendMessage(sender, { 
                        text: `⚠️ *Cara pakai:*\nKirim gambar/video dengan caption ${PREFIX}sticker` 
                    });
                }
                break;
                
            // ===== AI =====
            case 'ai':
            case 'gpt':
                if (!fullArgs) {
                    await sock.sendMessage(sender, { 
                        text: `⚠️ *Cara pakai:*\n${PREFIX}ai <pertanyaan>\n\nContoh: ${PREFIX}ai Apa itu bot?` 
                    });
                    break;
                }
                const aiResponse = await chatAI(fullArgs);
                await sock.sendMessage(sender, { text: `🤖 *AI Response:*\n\n${aiResponse}` });
                break;
                
            // ===== OWNER =====
            case 'owner':
                const db = readDB();
                const allOwners = [...db.owners, ...db.verifiedOwners];
                let ownerList = '👑 *DAFTAR OWNER*\n\n';
                allOwners.forEach((o, i) => {
                    ownerList += `${i+1}. ${o}\n`;
                });
                ownerList += `\n📌 Total: ${allOwners.length} owner`;
                await sock.sendMessage(sender, { text: ownerList });
                break;
                
            // ===== ADD OWNER =====
            case 'addowner':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner yang bisa tambah owner!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, { 
                        text: `⚠️ *Cara pakai:*\n${PREFIX}addowner <nomor>\n\nContoh: ${PREFIX}addowner 6281234567890` 
                    });
                    break;
                }
                const targetNumber = fullArgs.replace(/[^0-9]/g, '');
                if (targetNumber.length < 10) {
                    await sock.sendMessage(sender, { text: '❌ Nomor tidak valid!' });
                    break;
                }
                if (isOwner(targetNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Nomor ini sudah jadi owner!' });
                    break;
                }
                const password = generatePassword();
                const dbData = readDB();
                dbData.pendingOwners[targetNumber] = {
                    password: password,
                    status: 'waiting',
                    requestedBy: senderNumber,
                    timestamp: Date.now()
                };
                writeDB(dbData);
                await sock.sendMessage(targetNumber + '@s.whatsapp.net', {
                    text: `🔐 *Verifikasi Owner Baru*\n\nKamu diminta menjadi owner oleh ${senderNumber}.\n\n📝 *Password verifikasi:* ${password}\n\nCara verifikasi:\n1. Kirim password ini ke admin yang meminta (${senderNumber})\n2. Admin akan mengirim password ke bot\n3. Bot akan verifikasi otomatis\n\n⚠️ Password hanya berlaku 5 menit!`
                });
                await sock.sendMessage(sender, {
                    text: `✅ Password berhasil dikirim ke ${targetNumber}!\n\n📝 Password: ${password}\n\n⏰ Expire dalam 5 menit.\n\nLangkah selanjutnya:\n1. Minta user mengirim password ke kamu\n2. Lalu kirim ke bot dengan format:\n${PREFIX}verify ${targetNumber} ${password}`
                });
                break;
                
            // ===== VERIFY =====
            case 'verify':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner yang bisa verifikasi!' });
                    break;
                }
                const argsVerify = fullArgs.split(' ');
                if (argsVerify.length < 2) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}verify <nomor> <password>\n\nContoh: ${PREFIX}verify 6281234567890 AbCdE`
                    });
                    break;
                }
                const verifyNumber = argsVerify[0].replace(/[^0-9]/g, '');
                const verifyPassword = argsVerify[1];
                const dbVerify = readDB();
                const pending = dbVerify.pendingOwners[verifyNumber];
                if (!pending) {
                    await sock.sendMessage(sender, { text: '❌ Tidak ada permintaan owner untuk nomor ini!' });
                    break;
                }
                if (Date.now() - pending.timestamp > 300000) {
                    delete dbVerify.pendingOwners[verifyNumber];
                    writeDB(dbVerify);
                    await sock.sendMessage(sender, { text: '❌ Password sudah expired (5 menit)!' });
                    break;
                }
                if (pending.password !== verifyPassword) {
                    await sock.sendMessage(sender, { text: '❌ Password salah! Coba lagi.' });
                    break;
                }
                if (!dbVerify.verifiedOwners.includes(verifyNumber)) {
                    dbVerify.verifiedOwners.push(verifyNumber);
                }
                delete dbVerify.pendingOwners[verifyNumber];
                writeDB(dbVerify);
                await sock.sendMessage(verifyNumber + '@s.whatsapp.net', {
                    text: `🎉 *SELAMAT!*\n\nKamu sekarang resmi menjadi OWNER dari ${BOT_NAME}!\n\n👑 Kamu punya akses penuh ke semua fitur owner.\n\nGunakan ${PREFIX}menu untuk lihat fitur lengkap!`
                });
                await sock.sendMessage(sender, {
                    text: `✅ Berhasil verifikasi ${verifyNumber} sebagai owner baru!\n\n🎉 Sekarang ${verifyNumber} punya akses full sebagai owner.`
                });
                break;
                
            // ===== LIST OWNER =====
            case 'listowner':
                const dbList = readDB();
                const allOwnersList = [...dbList.owners, ...dbList.verifiedOwners];
                let listMsg = '👑 *DAFTAR OWNER*\n\n';
                allOwnersList.forEach((o, i) => {
                    listMsg += `${i+1}. ${o}\n`;
                });
                listMsg += `\n📌 Total: ${allOwnersList.length} owner`;
                await sock.sendMessage(sender, { text: listMsg });
                break;
                
            // ===== DELETE OWNER =====
            case 'delowner':
                if (!isOwner(senderNumber) || senderNumber !== OWNER_NUMBER) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner utama yang bisa hapus owner!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}delowner <nomor>\n\nContoh: ${PREFIX}delowner 6281234567890`
                    });
                    break;
                }
                const delNumber = fullArgs.replace(/[^0-9]/g, '');
                if (delNumber === OWNER_NUMBER) {
                    await sock.sendMessage(sender, { text: '❌ Tidak bisa hapus owner utama!' });
                    break;
                }
                const dbDel = readDB();
                const indexVerified = dbDel.verifiedOwners.indexOf(delNumber);
                if (indexVerified !== -1) {
                    dbDel.verifiedOwners.splice(indexVerified, 1);
                }
                const indexMain = dbDel.owners.indexOf(delNumber);
                if (indexMain !== -1) {
                    dbDel.owners.splice(indexMain, 1);
                }
                writeDB(dbDel);
                await sock.sendMessage(sender, { text: `✅ Berhasil hapus ${delNumber} dari daftar owner!` });
                break;
                
            // ===== BAN =====
            case 'ban':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner yang bisa ban!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}ban <nomor>\n\nContoh: ${PREFIX}ban 6281234567890`
                    });
                    break;
                }
                const banNumber = fullArgs.replace(/[^0-9]/g, '');
                if (isOwner(banNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Tidak bisa ban owner!' });
                    break;
                }
                const dbBan = readDB();
                if (!dbBan.banned.includes(banNumber)) {
                    dbBan.banned.push(banNumber);
                    writeDB(dbBan);
                    await sock.sendMessage(sender, { text: `✅ Berhasil ban ${banNumber}!` });
                } else {
                    await sock.sendMessage(sender, { text: '⚠️ User sudah di-ban!' });
                }
                break;
                
            // ===== UNBAN =====
            case 'unban':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner yang bisa unban!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}unban <nomor>\n\nContoh: ${PREFIX}unban 6281234567890`
                    });
                    break;
                }
                const unbanNumber = fullArgs.replace(/[^0-9]/g, '');
                const dbUnban = readDB();
                const indexBan = dbUnban.banned.indexOf(unbanNumber);
                if (indexBan !== -1) {
                    dbUnban.banned.splice(indexBan, 1);
                    writeDB(dbUnban);
                    await sock.sendMessage(sender, { text: `✅ Berhasil unban ${unbanNumber}!` });
                } else {
                    await sock.sendMessage(sender, { text: '⚠️ User tidak ada di daftar banned!' });
                }
                break;
                
            // ===== BROADCAST =====
            case 'bc':
                if (!isOwner(senderNumber)) {
                    await sock.sendMessage(sender, { text: '❌ Hanya owner yang bisa broadcast!' });
                    break;
                }
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}bc <pesan>\n\nContoh: ${PREFIX}bc Halo semua!`
                    });
                    break;
                }
                const chats = await sock.groupFetchAllParticipating();
                let sentCount = 0;
                for (const chatId in chats) {
                    try {
                        await sock.sendMessage(chatId, { text: `📢 *BROADCAST*\n\n${fullArgs}` });
                        sentCount++;
                        await delay(1000);
                    } catch (e) {}
                }
                await sock.sendMessage(sender, { text: `✅ Broadcast terkirim ke ${sentCount} grup/chat!` });
                break;
                
            // ===== PING =====
            case 'ping':
                const start = Date.now();
                await sock.sendMessage(sender, { text: '🏓 Pinging...' });
                const end = Date.now();
                await sock.sendMessage(sender, { text: `🏓 *Pong!*\n⏱️ ${end - start}ms` });
                break;
                
            // ===== INFO =====
            case 'info':
                await sock.sendMessage(sender, {
                    text: `🤖 *INFO BOT*\n\n` +
                          `📌 Nama: ${BOT_NAME}\n` +
                          `👑 Owner: ${OWNER_NAME} (${OWNER_NUMBER})\n` +
                          `📋 Prefix: ${PREFIX}\n` +
                          `⏰ Runtime: ${runtime(process.uptime())}\n` +
                          `📱 Status: ${isConnected ? 'Online ✅' : 'Offline ❌'}\n` +
                          `🔐 Login: ${loginMethod === 'qr' ? '📱 QR' : '🔑 Pairing'}\n` +
                          `🔥 Fitur: 500+\n` +
                          `💡 Semua GRATIS!\n\n` +
                          `Gunakan ${PREFIX}menu untuk lihat semua fitur!`
                });
                break;
                
            // ===== RULES =====
            case 'rules':
                await sock.sendMessage(sender, {
                    text: `📋 *RULES BOT*\n\n` +
                          `1. Dilarang spam\n` +
                          `2. Dilarang toxic\n` +
                          `3. Dilarang promosi\n` +
                          `4. Dilarang NSFW\n` +
                          `5. Patuhi admin grup\n` +
                          `6. Gunakan dengan bijak\n` +
                          `7. Laporkan bug ke owner\n` +
                          `8. Nikmati fitur gratis! 🔥`
                });
                break;
                
            // ===== DONASI =====
            case 'donasi':
                await sock.sendMessage(sender, {
                    text: `💖 *DONASI*\n\n` +
                          `Support bot ini biar tetap hidup!\n\n` +
                          `💰 Dana: ${OWNER_NUMBER}\n` +
                          `💰 OVO: ${OWNER_NUMBER}\n` +
                          `💰 Gopay: ${OWNER_NUMBER}\n\n` +
                          `Terima kasih untuk supportnya! 🙏`
                });
                break;
                
            // ===== BUG REPORT =====
            case 'bug':
                if (!fullArgs) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ *Cara pakai:*\n${PREFIX}bug <deskripsi bug>\n\nContoh: ${PREFIX}bug Fitur brat error`
                    });
                    break;
                }
                await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', {
                    text: `🐛 *LAPORAN BUG*\n\nDari: ${senderNumber}\nPesan: ${fullArgs}\n\nWaktu: ${new Date().toLocaleString()}`
                });
                await sock.sendMessage(sender, {
                    text: `✅ Laporan bug terkirim ke owner!\nTerima kasih sudah membantu improve bot! 🙏`
                });
                break;
                
            // ===== DEFAULT =====
            default:
                const dbCmd = readDB();
                if (dbCmd.commands && dbCmd.commands[command]) {
                    await sock.sendMessage(sender, { text: dbCmd.commands[command] });
                }
                break;
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

// ============ API ENDPOINTS ============
app.post('/api/connect', async (req, res) => {
    const { method } = req.body;
    await connectBot(method || 'qr');
    res.json({ success: true, message: 'Bot connecting...', method: method || 'qr' });
});

app.post('/api/disconnect', (req, res) => {
    if (sock) {
        sock.ws?.close();
        sock = null;
    }
    isConnected = false;
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        status: isConnected ? 'online' : 'offline',
        owner: OWNER_NUMBER,
        owners: readDB().owners,
        verified: readDB().verifiedOwners,
        totalFitur: 500,
        loginMethod: loginMethod || 'belum'
    });
});

app.get('/api/qr', (req, res) => {
    res.json({ qr: qrData });
});

app.get('/api/pairing', async (req, res) => {
    try {
        if (!sock) {
            await connectBot('pairing');
        }
        const number = req.query.number || OWNER_NUMBER;
        const code = await sock.requestPairingCode(number);
        res.json({ success: true, pairingCode: code });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🔥 Server jalan di port ${PORT}`);
    console.log(`🌐 Buka http://localhost:${PORT}`);
    console.log(`👑 Owner: ${OWNER_NUMBER}`);
    console.log(`🤖 Bot name: ${BOT_NAME}`);
    console.log(`📋 Prefix: ${PREFIX}`);
    console.log(`🔥 Total fitur: 500+`);
    console.log(`\n📌 Pilih metode login:`);
    console.log(`   1. QR Code: http://localhost:${PORT}/api/connect (method: qr)`);
    console.log(`   2. Pairing: http://localhost:${PORT}/api/connect (method: pairing)`);
    console.log(`\n💡 Default: QR Code`);
    
    // Default connect dengan QR
    await connectBot('qr');
});