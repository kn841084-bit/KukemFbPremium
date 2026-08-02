require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const login = require('@dongdev/fca-unofficial');
const moment = require('moment');
const axios = require('axios');
const cron = require('node-cron');

// ============================================================
// 📛 CẤU HÌNH THÔNG TIN BOT
// ============================================================
const BOT_NAME = 'KukemFbPremium';
const BOT_VERSION = '5.0.1';

// ============================================================
// 🌐 WEB SERVER & WEB DASHBOARD (MỤC 15)
// ============================================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Dashboard UI cơ bản
app.get('/', (req, res) => {
    let uptime = moment.duration(Date.now() - config.startTime).humanize();
    let memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dashboard - ${BOT_NAME}</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 20px; }
            .card { background: #2a2a2a; padding: 15px; margin-bottom: 10px; border-radius: 8px; }
            h1 { color: #00d2ff; }
            .status { color: #00ff66; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🤖 ${BOT_NAME} Dashboard (v${BOT_VERSION})</h1>
        <div class="card">
            <p>Trạng thái: <span class="status">ONLINE 🟢</span></p>
            <p>Thời gian hoạt động (Uptime): ${uptime}</p>
            <p>Bộ nhớ (RAM): ${memUsage} MB</p>
            <p>Tổng số tin nhắn: ${stats.totalMsg}</p>
            <p>Số nhóm quản lý: ${Object.keys(stats.threads || {}).length}</p>
            <p>Tổng người dùng: ${Object.keys(users).length}</p>
        </div>
    </body>
    </html>
    `);
});

// Endpoint Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', uptime: process.uptime() }));

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server & Dashboard running on port ${PORT}`));

// Keep-Alive Self Ping (Tránh Render ngủ)
setInterval(() => {
    axios.get(`http://localhost:${PORT}/health`).catch(() => {});
}, 280000);

// ============================================================
// 📁 HỆ THỐNG LƯU TRỮ DỮ LIỆU (JSON/DATABASE CAPABLE)
// ============================================================
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CONFIG_FILE = `${DATA_DIR}/config.json`;
const STATS_FILE = `${DATA_DIR}/stats.json`;
const ECONOMY_FILE = `${DATA_DIR}/economy.json`;
const USERDATA_FILE = `${DATA_DIR}/users.json`;
const GROUPDATA_FILE = `${DATA_DIR}/groups.json`;
const SETTINGS_FILE = `${DATA_DIR}/settings.json`;
const BLACKLIST_FILE = `${DATA_DIR}/blacklist.json`;
const SCHEDULES_FILE = `${DATA_DIR}/schedules.json`;
const LOG_FILE = `${DATA_DIR}/bot_log.txt`;

function loadJSON(file, def) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`Lỗi đọc file ${file}:`, e);
    }
    return def;
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Lỗi ghi file ${file}:`, e);
    }
}

// Khởi tạo các DB JSON
let config = loadJSON(CONFIG_FILE, { prefix: '!', adminIDs: [], subAdmins: [], logThreadID: '', startTime: Date.now(), botActive: true });
let stats = loadJSON(STATS_FILE, { totalMsg: 0, cmdCount: {}, threads: {} });
let economy = loadJSON(ECONOMY_FILE, {});
let users = loadJSON(USERDATA_FILE, {});
let groups = loadJSON(GROUPDATA_FILE, {});
let settings = loadJSON(SETTINGS_FILE, { anti_spam: true, anti_link: false, anti_word: [], whitelist: [] });
let blacklist = loadJSON(BLACKLIST_FILE, { users: [], groups: [] });
let schedules = loadJSON(SCHEDULES_FILE, []);

function saveAllData() {
    saveJSON(CONFIG_FILE, config);
    saveJSON(STATS_FILE, stats);
    saveJSON(ECONOMY_FILE, economy);
    saveJSON(USERDATA_FILE, users);
    saveJSON(GROUPDATA_FILE, groups);
    saveJSON(SETTINGS_FILE, settings);
    saveJSON(BLACKLIST_FILE, blacklist);
    saveJSON(SCHEDULES_FILE, schedules);
}

// 📌 Tự động Backup Dữ liệu mỗi 6 giờ
cron.schedule('0 */6 * * *', () => {
    console.log('🔄 Đang tự động sao lưu dữ liệu...');
    saveAllData();
    logToFile('Tự động sao lưu dữ liệu hệ thống.');
});

// ============================================================
// 🛠 HÀM TIỆN ÍCH TIÊN TIẾN
// ============================================================
function logToFile(msg) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

function getUID(api) { try { return api.getCurrentUserID(); } catch(e) { return null; } }

function isAdmin(uid) { return config.adminIDs.includes(uid); }
function isSubAdmin(uid) { return isAdmin(uid) || (config.subAdmins && config.subAdmins.includes(uid)); }

function getUserLevel(uid) {
    if (isAdmin(uid)) return '👑 Admin';
    if (isSubAdmin(uid)) return '🛡️ Sub-Admin';
    if (users[uid] && users[uid].vip) return '💎 VIP';
    return '👤 User';
}

function getBalance(uid) { return economy[uid] || 0; }
function setBalance(uid, amt) { economy[uid] = amt; saveJSON(ECONOMY_FILE, economy); }
function addBalance(uid, amt) { setBalance(uid, getBalance(uid) + amt); }

function getUserExp(uid) { return users[uid]?.exp || 0; }
function getUserLevelFromExp(uid) {
    let exp = getUserExp(uid);
    let lv = 1;
    while (exp >= lv * 100) { exp -= lv * 100; lv++; }
    return { level: lv, exp: exp, next: lv * 100 };
}
function addExp(uid, amt) {
    if (!users[uid]) users[uid] = {};
    users[uid].exp = (users[uid].exp || 0) + amt;
    saveJSON(USERDATA_FILE, users);
}

function logToThread(api, msg) {
    if (!config.logThreadID) return;
    api.sendMessage(`📌 [LOG HỆ THỐNG]\n${msg}`, config.logThreadID);
}

// ============================================================
// 🔇 MUTE / CHỐNG SPAM / BẢO VỆ
// ============================================================
const mutedUsers = {};
const userMsgTracker = {}; // Theo dõi tần suất tin nhắn chống flood

function isSpamming(senderID) {
    if (!settings.anti_spam) return false;
    const now = Date.now();
    if (!userMsgTracker[senderID]) userMsgTracker[senderID] = [];
    userMsgTracker[senderID] = userMsgTracker[senderID].filter(t => now - t < 5000); // 5 giây
    userMsgTracker[senderID].push(now);
    return userMsgTracker[senderID].length > 6; // > 6 tin nhắn trong 5s => Spam
}

// ============================================================
// 📋 DANH SÁCH MENU CHI TIẾT
// ============================================================
function getMainMenu(prefix) {
    return `
   🚀  ${BOT_NAME} v${BOT_VERSION}             
  Prefix: ${prefix} | Status: ${config.botActive ? 'Bật 🟢' : 'Tắt 🔴'}
  ------------------------------------
 📋 1. HỆ THỐNG CHÍNH:
    ${prefix}help / ${prefix}menu – Menu tổng
    ${prefix}info – Thông tin chi tiết bot
    ${prefix}ping – Kiểm tra độ trễ
    ${prefix}uptime – Thời gian hoạt động
    ${prefix}prefix [mới] – Xem/Đổi prefix
    ${prefix}restart – Khởi động lại (Admin)

 👤 2. NGƯỜI DÙNG:
    ${prefix}profile – Hồ sơ cá nhân
    ${prefix}rank – Cấp bậc & EXP
    ${prefix}daily – Điểm danh nhận thưởng
    ${prefix}top – Bảng xếp hạng tương tác
    ${prefix}block / ${prefix}unblock @tag – Cấm/Mở người dùng (Admin)

 👥 3. QUẢN LÝ NHÓM:
    ${prefix}groupinfo – Thông tin nhóm
    ${prefix}members – Danh sách thành viên
    ${prefix}setprefix [prefix] – Prefix riêng cho nhóm
    ${prefix}groupconfig [on/off] – Bật/Tắt module nhóm

 🛡️ 4. QUẢN TRỊ VIÊN:
    ${prefix}admin add/del @tag – Quản lý Admin
    ${prefix}subadmin add/del @tag – Quản lý SubAdmin
    ${prefix}toggle – Bật/Tắt bot tạm thời
    ${prefix}ban / ${prefix}unban – Quản lý Blacklist
    ${prefix}broadcast [tin nhắn] – Gửi thông báo toàn bộ nhóm
    ${prefix}backup / ${prefix}restore – Sao lưu/Phục hồi DB

 🛡️ 5. BẢO VỆ & ANTI-SPAM:
    ${prefix}antispam [on/off] – Chống spam
    ${prefix}antilink [on/off] – Chống gửi link
    ${prefix}antiword add/del [từ] – Bộ lọc từ cấm
    ${prefix}mute / ${prefix}unmute @tag – Mute thành viên

 🧠 6. TRÍ TUỆ NHÂN TẠO (AI):
    ${prefix}ai [câu hỏi] – Hỏi đáp AI
    ${prefix}translate [ngôn ngữ] [văn bản] – Dịch thuật
    ${prefix}code [yêu cầu] – Viết code / Giải thích code
    ${prefix}grammar [văn bản] – Sửa chính tả

 🎮 7. MINI GAME:
    ${prefix}taixiu [taik/xiu] [tiền] – Tài xỉu
    ${prefix}xocdia [chan/le] [tiền] – Xóc đĩa
    ${prefix}dice / ${prefix}coin – Tung xúc xắc / đồng xu
    ${prefix}guess – Đoán số may mắn
    ${prefix}quiz – Câu đố vui có thưởng

 💰 8. KINH TẾ ẢO:
    ${prefix}bal – Xem số dư
    ${prefix}transfer @tag [số tiền] – Chuyển tiền
    ${prefix}shop / ${prefix}buy [mã] – Cửa hàng
    ${prefix}inventory – Kho đồ cá nhân

 🔎 9. TÌM KIẾM & TIỆN ÍCH:
    ${prefix}wiki [từ khóa] – Tra cứu Wikipedia
    ${prefix}weather [địa điểm] – Thời tiết
    ${prefix}calc [biểu thức] – Máy tính
    ${prefix}shorten [link] – Rút gọn link
    ${prefix}qr [nội dung] – Tạo mã QR
    ${prefix}sitecheck [url] – Kiểm tra web live/die

 🎵 10. MEDIA & ÂM THANH:
    ${prefix}song [tên bài] – Tìm thông tin bài hát
    ${prefix}image [từ khóa] – Tìm ảnh
    ${prefix}sticker / ${prefix}gif – Gửi media ngẫu nhiên

 🖼️ 11. XỬ LÝ ẢNH (MOCK):
    ${prefix}resize / ${prefix}meme / ${prefix}avatar

 📢 12. THÔNG BÁO & LẬP LỊCH:
    ${prefix}schedule [phút] [nội dung] – Lên lịch thông báo

 📊 13 & 14. THỐNG KÊ & KỸ THUẬT:
    ${prefix}stats – Thống kê hệ thống
    ${prefix}sysinfo – Thông số Hardware (RAM/CPU)
    ${prefix}topcmd – Lệnh dùng nhiều nhất
    `;
}

// ============================================================
// 🤖 XỬ LÝ TIN NHẮN VÀ LỆNH CHÍNH (ASYNC)
// ============================================================
async function handleMessage(api, message) {
    try {
        if (!message || !message.body) return;
        const threadID = message.threadID;
        const senderID = message.senderID;
        const body = message.body.trim();
        const mentions = message.mentions || {};

        // Lấy prefix riêng của nhóm hoặc mặc định
        const prefix = groups[threadID]?.prefix || config.prefix;

        // 1. Kiểm tra Blacklist
        if (blacklist.users.includes(senderID)) {
            return; // Im lặng nếu người dùng bị ban
        }
        if (blacklist.groups.includes(threadID)) return;

        // 2. Chống Spam
        if (isSpamming(senderID) && !isSubAdmin(senderID)) {
            api.sendMessage(`⚠️ ${senderID}, bạn đang thao tác quá nhanh! Hãy chậm lại.`, threadID);
            return;
        }

        // 3. Tự động nhận Admin đầu tiên nếu danh sách trống
        if (config.adminIDs.length === 0 && body.startsWith(prefix)) {
            config.adminIDs.push(senderID);
            saveJSON(CONFIG_FILE, config);
            api.sendMessage(`👑 Bạn đã trở thành Admin tối cao của ${BOT_NAME}.`, threadID);
        }

        // 4. Kiểm tra xem bot có đang bật không
        if (!config.botActive && !isAdmin(senderID)) return;

        // 5. Cập nhật Thống kê Hoạt động
        stats.totalMsg = (stats.totalMsg || 0) + 1;
        if (!stats.threads[threadID]) stats.threads[threadID] = {};
        stats.threads[threadID][senderID] = (stats.threads[threadID][senderID] || 0) + 1;

        // 6. Tăng EXP cho tin nhắn thường
        if (!body.startsWith(prefix)) {
            addExp(senderID, 2);

            // Kiểm tra Anti-link
            if (
    settings.anti_link &&
    !isSubAdmin(senderID) &&
    (
        body.includes('http://') ||
        body.includes('https://') ||
        body.includes('www.') ||
        body.includes('tiktok.com') ||
        body.includes('facebook.com') ||
        body.includes('fb.me') ||
        body.includes('youtube.com') ||
        body.includes('youtu.be')
    )
) {
    return api.sendMessage(
        '⚠️ CẢNH BÁO ANTI-LINK\n\n' +
        '🚫 Nhóm không cho phép gửi liên kết!\n' +
        '❌ Vui lòng không gửi link trong nhóm.',
        threadID
    );
            }
            // Tag Bot Phản Hồi
            let botID = getUID(api);
            if (botID && mentions[botID]) {
                const replies = [
                    `${BOT_NAME} nghe đây! Bạn cần trợ giúp gì? Gõ ${prefix}help nhé!`,
                    `Dạ, em nghe nè! 🚀`,
                    `mày gay à !?😊`
                ];
                api.sendMessage(replies[Math.floor(Math.random() * replies.length)], threadID);
            }
            return;
        }

        // 7. Xử lý Lệnh
        const content = body.slice(prefix.length).trim();
        if (!content) return;
        const args = content.split(/\s+/);
        const cmd = args.shift().toLowerCase();

        stats.cmdCount[cmd] = (stats.cmdCount[cmd] || 0) + 1;
        saveAllData();

        // --- 🤖 MODULE 1: HỆ THỐNG CHÍNH ---
        if (cmd === 'help' || cmd === 'menu') {
            return api.sendMessage(getMainMenu(prefix), threadID);
        }

        if (cmd === 'info') {
            let botID = getUID(api);
            let uptime = moment.duration(Date.now() - config.startTime).humanize();
            let msg = `
╔════════════════════════════╗
║  🤖 THÔNG TIN ${BOT_NAME}  
╠════════════════════════════╣
║ 📛 Tên Bot: ${BOT_NAME}
║ ⚙️ Phiên bản: ${BOT_VERSION}
║ 🆔 UID Bot: ${botID || 'N/A'}
║ 🔑 Prefix: ${prefix}
║ 👑 Admin: ${config.adminIDs.length} người
║ 🛡️ SubAdmin: ${config.subAdmins?.length || 0} người
║ 👥 Nhóm phục vụ: ${Object.keys(stats.threads).length}
║ 📊 Tổng tin nhắn: ${stats.totalMsg}
║ ⏱️ Uptime: ${uptime}
╚════════════════════════════╝`;
            return api.sendMessage(msg, threadID);
        }

        if (cmd === 'ping') {
            let start = Date.now();
            return api.sendMessage(`⏳ Đang kiểm tra tín hiệu...`, threadID, (err, info) => {
                if (!err) {
                    let ping = Date.now() - start;
                    api.sendMessage(`🏓 Pong! Độ trễ phản hồi: ${ping}ms`, threadID);
                }
            });
        }

        if (cmd === 'uptime') {
            let uptime = moment.duration(Date.now() - config.startTime).humanize();
            return api.sendMessage(`⏱️ ${BOT_NAME} đã hoạt động liên tục trong: ${uptime}`, threadID);
        }

        if (cmd === 'prefix') {
            if (args[0]) {
                if (!isSubAdmin(senderID)) return api.sendMessage(`❌ Bạn không có quyền đổi prefix hệ thống.`, threadID);
                config.prefix = args[0];
                saveJSON(CONFIG_FILE, config);
                return api.sendMessage(`✅ Đã đổi prefix hệ thống thành: ${args[0]}`, threadID);
            }
            return api.sendMessage(`🔧 Prefix hiện tại của hệ thống: ${prefix}`, threadID);
        }

        if (cmd === 'restart') {
            if (!isAdmin(senderID)) return api.sendMessage(`❌ Chỉ Admin tối cao mới có thể khởi động lại.`, threadID);
            api.sendMessage(`🔄 ${BOT_NAME} đang tiến hành reboot...`, threadID);
            logToFile(`Bot được khởi động lại bởi Admin ${senderID}`);
            setTimeout(() => process.exit(0), 1000);
            return;
        }

        // --- 👤 MODULE 2: NGƯỜI DÙNG ---
        if (cmd === 'profile' || cmd === 'rank') {
            let target = Object.keys(mentions)[0] || senderID;
            let lv = getUserLevelFromExp(target);
            let bal = getBalance(target);
            let role = getUserLevel(target);
            let msg = `
╔════════════════════════════╗
║  👤 HỒ SƠ NGƯỜI DÙNG       
╠════════════════════════════╣
║ 🆔 ID: ${target}
║ 🏅 Cấp bậc: ${role}
║ 📊 Level: ${lv.level} (EXP: ${lv.exp}/${lv.next})
║ 💰 Tài sản: ${bal.toLocaleString()} Coin
║ 💬 Số tin nhắn nhóm: ${stats.threads[threadID]?.[target] || 0}
╚════════════════════════════╝`;
            return api.sendMessage(msg, threadID);
        }

        if (cmd === 'daily') {
            let now = Date.now();
            let last = users[senderID]?.daily || 0;
            if (now - last < 24 * 3600 * 1000) {
                let remain = moment.duration(24 * 3600 * 1000 - (now - last)).humanize();
                return api.sendMessage(`⏳ Bạn đã điểm danh hôm nay rồi. Vui lòng quay lại sau: ${remain}.`, threadID);
            }
            let reward = 1000;
            addBalance(senderID, reward);
            addExp(senderID, 50);
            if (!users[senderID]) users[senderID] = {};
            users[senderID].daily = now;
            saveJSON(USERDATA_FILE, users);
            return api.sendMessage(`🎁 Điểm danh thành công! Bạn nhận được +${reward} Coin và +50 EXP.`, threadID);
        }

        if (cmd === 'top') {
            let data = stats.threads[threadID] || {};
            let sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (!sorted.length) return api.sendMessage('📭 Chưa có dữ liệu tương tác trong nhóm này.', threadID);
            let msg = '🏆 BẢNG XẾP HẠNG TƯƠNG TÁC NHÓM\n------------------------------------\n';
            sorted.forEach(([id, count], i) => {
                let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                msg += `${medal} ID: ${id} ➔ ${count} tin nhắn\n`;
            });
            return api.sendMessage(msg, threadID);
        }

        // --- 👥 MODULE 3: QUẢN LÝ NHÓM ---
        if (cmd === 'groupinfo') {
            api.getThreadInfo(threadID, (err, info) => {
                if (err) return api.sendMessage('❌ Không thể lấy thông tin nhóm.', threadID);
                let msg = `
📌 THÔNG TIN NHÓM:
- Tên nhóm: ${info.threadName || 'Không tên'}
- ID Nhóm: ${threadID}
- Tổng số thành viên: ${info.participantIDs.length}
- Số Quản trị viên: ${info.adminIDs.length}
- Prefix nhóm: ${groups[threadID]?.prefix || config.prefix}`;
                api.sendMessage(msg, threadID);
            });
            return;
        }

        if (cmd === 'setprefix') {
            let newP = args[0];
            if (!newP) return api.sendMessage(`❌ Vui lòng nhập prefix mới. Ví dụ: ${prefix}setprefix #`, threadID);
            if (!groups[threadID]) groups[threadID] = {};
            groups[threadID].prefix = newP;
            saveJSON(GROUPDATA_FILE, groups);
            return api.sendMessage(`✅ Đã đặt prefix riêng cho nhóm này là: ${newP}`, threadID);
        }

        // --- 🛡️ MODULE 4: QUẢN TRỊ VIÊN HỆ THỐNG ---
        if (cmd === 'admin') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Bạn không có quyền Admin tối cao.', threadID);
            let act = args[0];
            let target = Object.keys(mentions)[0] || args[1];
            if (act === 'add' && target) {
                if (!config.adminIDs.includes(target)) config.adminIDs.push(target);
                saveJSON(CONFIG_FILE, config);
                return api.sendMessage(`✅ Đã thêm ${target} làm Admin.`, threadID);
            } else if (act === 'del' && target) {
                config.adminIDs = config.adminIDs.filter(i => i !== target);
                saveJSON(CONFIG_FILE, config);
                return api.sendMessage(`✅ Đã xóa Admin ${target}.`, threadID);
            }
            return api.sendMessage(`Cú pháp: ${prefix}admin [add/del] @tag`, threadID);
        }

        if (cmd === 'subadmin') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Bạn không có quyền thực hiện.', threadID);
            let act = args[0];
            let target = Object.keys(mentions)[0] || args[1];
            if (!config.subAdmins) config.subAdmins = [];
            if (act === 'add' && target) {
                if (!config.subAdmins.includes(target)) config.subAdmins.push(target);
                saveJSON(CONFIG_FILE, config);
                return api.sendMessage(`✅ Đã thêm ${target} làm SubAdmin.`, threadID);
            } else if (act === 'del' && target) {
                config.subAdmins = config.subAdmins.filter(i => i !== target);
                saveJSON(CONFIG_FILE, config);
                return api.sendMessage(`✅ Đã xóa SubAdmin ${target}.`, threadID);
            }
            return api.sendMessage(`Cú pháp: ${prefix}subadmin [add/del] @tag`, threadID);
        }

        if (cmd === 'toggle') {
            if (!isSubAdmin(senderID)) return api.sendMessage('❌ Chỉ Admin/SubAdmin.', threadID);
            config.botActive = !config.botActive;
            saveJSON(CONFIG_FILE, config);
            return api.sendMessage(`🤖 Trạng thái bot hiện tại: ${config.botActive ? 'BẬT 🟢' : 'TẮT 🔴'}`, threadID);
        }

        if (cmd === 'ban') {
            if (!isSubAdmin(senderID)) return api.sendMessage('❌ Bạn không có quyền.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            if (!target) return api.sendMessage('❌ Vui lòng tag hoặc nhập UID cần ban.', threadID);
            if (!blacklist.users.includes(target)) blacklist.users.push(target);
            saveJSON(BLACKLIST_FILE, blacklist);
            return api.sendMessage(`🚫 Đã thêm ${target} vào danh sách cấm (Blacklist).`, threadID);
        }

        if (cmd === 'unban') {
            if (!isSubAdmin(senderID)) return api.sendMessage('❌ Bạn không có quyền.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            blacklist.users = blacklist.users.filter(i => i !== target);
            saveJSON(BLACKLIST_FILE, blacklist);
            return api.sendMessage(`✅ Đã gỡ cấm cho ${target}.`, threadID);
        }

        if (cmd === 'broadcast') {
            if (!isSubAdmin(senderID)) return api.sendMessage('❌ Chỉ Admin.', threadID);
            let msg = args.join(' ');
            if (!msg) return api.sendMessage('❌ Nhập nội dung thông báo.', threadID);
            let tList = Object.keys(stats.threads);
            let count = 0;
            tList.forEach(tid => {
                api.sendMessage(`📢 [THÔNG BÁO TỪ ADMIN]\n\n${msg}`, tid, (e) => { if (!e) count++; });
            });
            return api.sendMessage(`✅ Đã gửi thông báo đến ${tList.length} nhóm.`, threadID);
        }

        if (cmd === 'backup') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ Admin.', threadID);
            saveAllData();
            return api.sendMessage('💾 Đã sao lưu toàn bộ dữ liệu hệ thống thành công!', threadID);
        }

        // --- 🛡️ MODULE 5: BẢO VỆ NHÓM ---
        // ================================
// 🛡️ LỆNH ANTISPAM
// ================================
if (cmd === 'antispam') {

    if (!isSubAdmin(senderID)) {
        return api.sendMessage(
            '❌ Bạn không có quyền sử dụng lệnh này!',
            threadID
        );
    }

    const status = (args[0] || '').toLowerCase();

    if (status !== 'on' && status !== 'off') {
        return api.sendMessage(
            `🛡️ ANTISPAM\n\n` +
            `${prefix}antispam on - Bật Anti-Spam 🟢\n` +
            `${prefix}antispam off - Tắt Anti-Spam 🔴`,
            threadID
        );
    }

    settings.anti_spam = status === 'on';

    saveJSON(SETTINGS_FILE, settings);

    return api.sendMessage(
        `🛡️ Anti-Spam đã ${
            settings.anti_spam ? 'BẬT 🟢' : 'TẮT 🔴'
        }`,
        threadID
    );
}


// ================================
// 🔗 LỆNH ANTILINK
// ================================
if (cmd === 'antilink') {

    if (!isSubAdmin(senderID)) {
        return api.sendMessage(
            '❌ Bạn không có quyền sử dụng lệnh này!',
            threadID
        );
    }

    const status = (args[0] || '').toLowerCase();

    if (status !== 'on' && status !== 'off') {
        return api.sendMessage(
            `🔗 ANTILINK\n\n` +
            `${prefix}antilink on - Bật Anti-Link 🟢\n` +
            `${prefix}antilink off - Tắt Anti-Link 🔴`,
            threadID
        );
    }

    settings.anti_link = status === 'on';

    saveJSON(SETTINGS_FILE, settings);

    return api.sendMessage(
        `🔗 Anti-Link đã ${
            settings.anti_link ? 'BẬT 🟢' : 'TẮT 🔴'
        }`,
        threadID
    );
        }
        // --- 🧠 MODULE 6: TRÍ TUỆ NHÂN TẠO (AI) ---
        if (cmd === 'ai') {
            let prompt = args.join(' ');
            if (!prompt) return api.sendMessage('❌ Vui lòng nhập câu hỏi.', threadID);
            api.sendMessage('⏳ AI đang xử lý câu hỏi...', threadID);
            try {
                let res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`);
                return api.sendMessage(`🤖 [AI Answer]:\n${res.data.response || 'Không thể phản hồi.'}`, threadID);
            } catch (e) {
                return api.sendMessage('❌ Kết nối API AI thất bại.', threadID);
            }
        }

        if (cmd === 'translate') {
            let lang = args[0] || 'vi';
            let text = args.slice(1).join(' ');
            if (!text) return api.sendMessage(`❌ Cú pháp: ${prefix}translate [lang] [văn bản]`, threadID);
            try {
                let res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
                return api.sendMessage(`🌐 Dịch (${lang}):\n${res.data[0][0][0]}`, threadID);
            } catch (e) {
                return api.sendMessage('❌ Lỗi dịch thuật.', threadID);
            }
        }

        // --- 🎮 MODULE 7: MINI GAME ---
        if (cmd === 'taixiu') {
            let choice = args[0]?.toLowerCase();
            let bet = parseInt(args[1]);
            if (!['tai', 'xiu'].includes(choice) || isNaN(bet) || bet <= 0) {
                return api.sendMessage(`❌ Cú pháp: ${prefix}taixiu [tai/xiu] [số tiền]`, threadID);
            }
            if (getBalance(senderID) < bet) return api.sendMessage('❌ Bạn không đủ tiền đặt cược!', threadID);

            let d1 = Math.floor(Math.random() * 6) + 1;
            let d2 = Math.floor(Math.random() * 6) + 1;
            let d3 = Math.floor(Math.random() * 6) + 1;
            let total = d1 + d2 + d3;
            let ans = total >= 11 ? 'tai' : 'xiu';

            if (choice === ans) {
                addBalance(senderID, bet);
                return api.sendMessage(`🎲 Xúc xắc: ${d1} - ${d2} - ${d3} (${total} điểm -> ${ans.toUpperCase()})\n🎉 Bạn THẮNG +${bet} Coin!`, threadID);
            } else {
                addBalance(senderID, -bet);
                return api.sendMessage(`🎲 Xúc xắc: ${d1} - ${d2} - ${d3} (${total} điểm -> ${ans.toUpperCase()})\n💸 Bạn THUA -${bet} Coin!`, threadID);
            }
        }

        if (cmd === 'xocdia') {
            let choice = args[0]?.toLowerCase();
            let bet = parseInt(args[1]);
            if (!['chan', 'le'].includes(choice) || isNaN(bet) || bet <= 0) {
                return api.sendMessage(`❌ Cú pháp: ${prefix}xocdia [chan/le] [số tiền]`, threadID);
            }
            if (getBalance(senderID) < bet) return api.sendMessage('❌ Bạn không đủ tiền đặt cược!', threadID);

            let coins = [Math.random() < 0.5, Math.random() < 0.5, Math.random() < 0.5, Math.random() < 0.5];
            let redCount = coins.filter(c => c).length;
            let ans = redCount % 2 === 0 ? 'chan' : 'le';

            if (choice === ans) {
                addBalance(senderID, bet);
                return api.sendMessage(`🪙 Kết quả: ${redCount} Đỏ / ${4 - redCount} Trắng (${ans.toUpperCase()})\n🎉 Bạn THẮNG +${bet} Coin!`, threadID);
            } else {
                addBalance(senderID, -bet);
                return api.sendMessage(`🪙 Kết quả: ${redCount} Đỏ / ${4 - redCount} Trắng (${ans.toUpperCase()})\n💸 Bạn THUA -${bet} Coin!`, threadID);
            }
        }

        if (cmd === 'dice') {
            let num = Math.floor(Math.random() * 6) + 1;
            return api.sendMessage(`🎲 Kết quả đổ xúc xắc: ${num}`, threadID);
        }

        if (cmd === 'coin') {
            let res = Math.random() < 0.5 ? 'MẶT NGỬA 🪙' : 'MẶT SẤP 🪙';
            return api.sendMessage(`🪙 Kết quả tung đồng xu: ${res}`, threadID);
        }

        // --- 💰 MODULE 8: KINH TẾ ẢO ---
        if (cmd === 'bal' || cmd === 'balance') {
            let target = Object.keys(mentions)[0] || senderID;
            return api.sendMessage(`💰 Số dư của ${target}: ${getBalance(target).toLocaleString()} Coin`, threadID);
        }

        if (cmd === 'transfer') {
            let target = Object.keys(mentions)[0];
            let amt = parseInt(args[1]);
            if (!target || isNaN(amt) || amt <= 0) return api.sendMessage(`❌ Cú pháp: ${prefix}transfer @tag [số tiền]`, threadID);
            if (getBalance(senderID) < amt) return api.sendMessage('❌ Số dư không đủ.', threadID);

            addBalance(senderID, -amt);
            addBalance(target, amt);
            return api.sendMessage(`✅ Đã chuyển thành công ${amt.toLocaleString()} Coin cho ${target}.`, threadID);
        }

        if (cmd === 'shop') {
            let shopMsg = `
🛒 CỬA HÀNG VẬT PHẨM VIRTUAL:
1️⃣ Thẻ VIP (10,000 Coin) -> Quyền lợi đặc biệt
2️⃣ Đổi Tên Màu (5,000 Coin)
Gõ ${prefix}buy [mã số] để mua.`;
            return api.sendMessage(shopMsg, threadID);
        }

        if (cmd === 'buy') {
            let code = args[0];
            if (code === '1') {
                if (getBalance(senderID) < 10000) return api.sendMessage('❌ Bạn không đủ 10,000 Coin.', threadID);
                addBalance(senderID, -10000);
                if (!users[senderID]) users[senderID] = {};
                users[senderID].vip = true;
                saveJSON(USERDATA_FILE, users);
                return api.sendMessage('🎉 Chúc mừng bạn đã mua thành công Thẻ VIP!', threadID);
            }
            return api.sendMessage('❌ Mã vật phẩm không hợp lệ.', threadID);
        }

        // --- 🔎 MODULE 9: TÌM KIẾM & TIỆN ÍCH ---
        if (cmd === 'wiki') {
            let query = args.join(' ');
            if (!query) return api.sendMessage('❌ Nhập từ khóa cần tìm.', threadID);
            try {
                let res = await axios.get(`https://vi.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                return api.sendMessage(`📚 Wikipedia [${query}]:\n\n${res.data.extract}`, threadID);
            } catch (e) {
                return api.sendMessage('❌ Không tìm thấy thông tin trên Wikipedia.', threadID);
            }
        }

        if (cmd === 'weather') {
    const loc = args.join(' ').trim();

    if (!loc) {
        return api.sendMessage(
            '🌤️ Vui lòng nhập tỉnh/thành phố!\n\n' +
            `📌 Ví dụ:\n` +
            `${prefix}weather An Giang\n` +
            `${prefix}weather Bến Tre\n` +
            `${prefix}weather Hà Nội\n` +
            `${prefix}weather Bắc Giang\n` +
            `${prefix}weather Kiên Giang\n` +
            `${prefix}weather Vĩnh Long`,
            threadID
        );
    }

    try {
        const res = await axios.get(
            `https://wttr.in/${encodeURIComponent(loc)}?format=3`,
            {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            }
        );

        const weather = String(res.data || '').trim();

        if (!weather) {
            return api.sendMessage(
                `❌ Không tìm thấy thời tiết cho: ${loc}`,
                threadID
            );
        }

        return api.sendMessage(
            `🌤️ THỜI TIẾT\n` +
            `📍 ${loc}\n` +
            `━━━━━━━━━━━━━━\n` +
            `${weather}`,
            threadID
        );

    } catch (error) {
        console.error('Weather Error:', error.message);

        return api.sendMessage(
            `❌ Không thể tra cứu thời tiết tại ${loc}.\n` +
            `🔄 Vui lòng thử lại sau.`,
            threadID
        );
    }
        }
        if (cmd === 'shorten') {
            let url = args[0];
            if (!url) return api.sendMessage('❌ Nhập URL cần rút gọn.', threadID);
            try {
                let res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
                return api.sendMessage(`🔗 Link rút gọn: ${res.data}`, threadID);
            } catch (e) {
                return api.sendMessage('❌ Rút gọn link thất bại.', threadID);
            }
        }

        if (cmd === 'qr') {
            let text = args.join(' ');
            if (!text) return api.sendMessage('❌ Nhập nội dung để tạo QR.', threadID);
            return api.sendMessage(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=300x300`, threadID);
        }

        if (cmd === 'sitecheck') {
            let url = args[0];
            if (!url) return api.sendMessage('❌ Nhập URL cần kiểm tra.', threadID);
            try {
                let res = await axios.get(url, { timeout: 5000 });
                return api.sendMessage(`🌐 Trang web ${url} đang HOẠT ĐỘNG (Status: ${res.status}).`, threadID);
            } catch (e) {
                return api.sendMessage(`🌐 Trang web ${url} KHÔNG THỂ KẾT NỐI (Offline/Die).`, threadID);
            }
        }

        // --- 📢 MODULE 12: LẬP LỊCH THÔNG BÁO ---
        if (cmd === 'schedule') {
            let mins = parseInt(args[0]);
            let note = args.slice(1).join(' ');
            if (isNaN(mins) || !note) return api.sendMessage(`❌ Cú pháp: ${prefix}schedule [số phút] [nội dung]`, threadID);

            api.sendMessage(`⏰ Đã hẹn giờ nhắc nhở sau ${mins} phút.`, threadID);
            setTimeout(() => {
                api.sendMessage(`🔔 [NHẮC NHỞ ĐÃ HẸN]:\n${note}`, threadID);
            }, mins * 60 * 1000);
            return;
        }

        // --- 📊 MODULE 13 & 14: THỐNG KÊ & KỸ THUẬT ---
        if (cmd === 'stats' || cmd === 'sysinfo') {
            let mem = process.memoryUsage();
            let msg = `
📊 THỐNG KÊ KỸ THUẬT BOT:
- RAM Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB
- Node.js Version: ${process.version}
- Platform: ${process.platform}
- Tổng số tin nhắn đã xử lý: ${stats.totalMsg}
- Số lệnh khác nhau được gọi: ${Object.keys(stats.cmdCount).length}`;
            return api.sendMessage(msg, threadID);
        }

        if (cmd === 'topcmd') {
            let sorted = Object.entries(stats.cmdCount || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
            let msg = '📋 TOP 5 LỆNH ĐƯỢC DÙNG NHIỀU NHẤT:\n';
            sorted.forEach(([c, count]) => msg += `- ${prefix}${c}: ${count} lần\n`);
            return api.sendMessage(msg, threadID);
        }

        // Thông báo lệnh không hợp lệ
        return api.sendMessage(`❌ Lệnh "${cmd}" không tồn tại. Gõ ${prefix}help để xem danh sách lệnh!`, threadID);

    } catch (error) {
        console.error('LỖI KHÔNG MONG MUỐN KHI XỬ LÝ MESSAGE:', error);
        logToFile(`ERROR: ${error.stack || error}`);
    }
}

// ============================================================
// 🔐 ĐĂNG NHẬP FACEBOOK & KHỞI TẠO VÒNG LẶP LISTEN MQTT
// ============================================================
let reconnectTimer = null;
let isConnecting = false;
let isListening = false;

function getAppState() {
    try {
        const raw = process.env.APPSTATE;
        if (!raw) throw new Error('Không tìm thấy biến môi trường APPSTATE');

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('APPSTATE phải là một mảng JSON cookie.');
        }
        console.log(`🍪 Cookie hợp lệ: Đã tải thành công ${parsed.length} cookies.`);
        return parsed;
    } catch (error) {
        console.error('❌ Cấu hình APPSTATE lỗi:', error.message);
        return null;
    }
}

function startListening(api) {
    if (isListening) return;
    isListening = true;

    console.log(`👂 ${BOT_NAME} đang lắng nghe MQTT...`);

    api.listenMqtt(async (err, msg) => {
        if (err) {
            console.error(`❌ Lỗi MQTT:`, err.errorDescription || err.message || err);
            logToFile(`MQTT Error: ${JSON.stringify(err)}`);
            isListening = false;
            scheduleReconnect();
            return;
        }

        if (!msg) return;

        // Xử lý Sự kiện Nhóm (Chào mừng / Tạm biệt) - MODULE 3
        if (msg.type === 'event') {
            if (msg.logMessageType === 'log:subscribe') {
                let addedID = msg.logMessageData.addedParticipants[0].userFbId;
                api.sendMessage(`🎉 Chào mừng ${addedID} đã tham gia nhóm! Chúc bạn vui vẻ!`, msg.threadID);
            } else if (msg.logMessageType === 'log:unsubscribe') {
                let leftID = msg.logMessageData.leftParticipantFbId;
                api.sendMessage(`👋 Thành viên ${leftID} đã rời khỏi nhóm.`, msg.threadID);
            }
        }

        // Xử lý Tin nhắn
        if (msg.type === 'message') {
            await handleMessage(api, msg);
        }
    });
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        console.log(`🔄 Đang thử kết nối lại...`);
        loginFacebook();
    }, 15000);
}

function loginFacebook() {
    if (isConnecting) return;
    isConnecting = true;

    const appState = getAppState();
    if (!appState) {
        isConnecting = false;
        console.error('❌ Dừng đăng nhập do thiếu APPSTATE.');
        scheduleReconnect();
        return;
    }

    console.log(`🔐 Đang đăng nhập Facebook...`);

    login({ appState, forceLogin: false, listenEvents: true, selfListen: true }, (err, api) => {
        isConnecting = false;
        if (err) {
            console.error(`❌ Đăng nhập thất bại:`, err.errorDescription || err.message);
            logToFile(`Login Failed: ${JSON.stringify(err)}`);
            scheduleReconnect();
            return;
        }

        console.log(`✅ Đăng nhập Facebook thành công!`);

        try {
            api.setOptions({
                listenEvents: true,
                selfListen: false,
                autoMarkDelivery: false,
                autoMarkRead: false
            });
        } catch (e) {}

        startListening(api);
    });
}

// ============================================================
// 🚀 KHỞI ĐỘNG HỆ THỐNG
// ============================================================
console.log(`
╔══════════════════════════════════════╗
║       🤖 ${BOT_NAME} v${BOT_VERSION}
║       🚀 ĐANG KHỞI ĐỘNG HỆ THỐNG...
╚══════════════════════════════════════╝
`);

loginFacebook();

// Xử lý Lỗi Toàn Cục Tránh Crash Server
process.on('uncaughtException', (e) => {
    console.error(`❌ Crash Guard Exception:`, e);
    logToFile(`Uncaught Exception: ${e.stack || e}`);
});

process.on('unhandledRejection', (e) => {
    console.error(`❌ Crash Guard Rejection:`, e);
    logToFile(`Unhandled Rejection: ${e.stack || e}`);
});
