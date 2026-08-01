
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const login = require('@dongdev/fca-unofficial');
const moment = require('moment');
const axios = require('axios');

// ============================================================
// 📛 TÊN BOT
// ============================================================
const BOT_NAME = 'KukemFbPremium';
const BOT_VERSION = '5.0.1';

// ============================================================
// 🌐 WEB SERVER
// ============================================================
const app = express();
app.get('/', (req, res) => res.send(`🤖 ${BOT_NAME} đang hoạt động!`));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server port ${PORT}`));

// Tự động ping giữ bot không sleep
setInterval(() => {
    axios.get(`http://localhost:${PORT}`).catch(() => {});
}, 300000);

// ============================================================
// 📁 FILE CẤU HÌNH
// ============================================================
const CONFIG_FILE = './fb_config.json';
const STATS_FILE = './fb_stats.json';
const ECONOMY_FILE = './fb_economy.json';
const USERDATA_FILE = './fb_users.json';
const SETTINGS_FILE = './fb_settings.json';
const BLACKLIST_FILE = './fb_blacklist.json';
const LOG_FILE = './fb_log.txt';

// ============================================================
// ⚙️ HÀM ĐỌC/GHI JSON
// ============================================================
function loadJSON(file, def) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    return def;
}
function saveJSON(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) {}
}

let config = loadJSON(CONFIG_FILE, { prefix: '!', adminIDs: [], logThreadID: '', startTime: Date.now() });
let stats = loadJSON(STATS_FILE, { totalMsg: 0, cmdCount: {} });
let economy = loadJSON(ECONOMY_FILE, {});
let users = loadJSON(USERDATA_FILE, {});
let settings = loadJSON(SETTINGS_FILE, { anti_spam: true, anti_flood: true, welcome: true, goodbye: true });
let blacklist = loadJSON(BLACKLIST_FILE, { users: [], groups: [] });

function saveAll() {
    saveJSON(CONFIG_FILE, config);
    saveJSON(STATS_FILE, stats);
    saveJSON(ECONOMY_FILE, economy);
    saveJSON(USERDATA_FILE, users);
    saveJSON(SETTINGS_FILE, settings);
    saveJSON(BLACKLIST_FILE, blacklist);
}

// ============================================================
// 🛠 HÀM TIỆN ÍCH
// ============================================================
function getUID(api) { try { return api.getCurrentUserID(); } catch(e) { return null; } }
function isAdmin(uid) { return config.adminIDs.includes(uid); }
function getUserLevel(uid) {
    if (isAdmin(uid)) return '👑 Admin';
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
    api.sendMessage(`📌 ${msg}`, config.logThreadID, (e) => { if(e) console.error('Log lỗi:', e); });
}
function logToFile(msg) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

// ============================================================
// 🔇 MUTE TẠM
// ============================================================
const mutedUsers = {};
function muteUser(api, threadID, userID, minutes) {
    if (!mutedUsers[threadID]) mutedUsers[threadID] = {};
    if (mutedUsers[threadID][userID]) clearTimeout(mutedUsers[threadID][userID]);
    mutedUsers[threadID][userID] = setTimeout(() => {
        api.sendMessage(`🔊 Hết mute cho ${userID}`, threadID);
        delete mutedUsers[threadID][userID];
    }, minutes * 60 * 1000);
    api.sendMessage(`🔇 Đã mute ${userID} trong ${minutes} phút.`, threadID);
}

// ============================================================
// 📋 MENU CHÍNH (ĐÃ THÊM TÊN BOT)
// ============================================================
function getMainMenu(prefix) {
    return `

   🚀  ${BOT_NAME}  Kukem             
  Prefix: ${prefix}                               
  Admin: ${config.adminIDs.length} người          
  Nhóm: ${Object.keys(stats).length} 
  ------------------------------------
 📋 LỆNH CƠ BẢN:                                   
    ${prefix}help   – Menu chi tiết                 
    ${prefix}info   – Thông tin bot                 
    ${prefix}ping   – Kiểm tra ping                 
    ${prefix}uptime – Thời gian hoạt động           
    ${prefix}prefix – Xem/đổi tiền tố               
    ${prefix}restart– Khởi động lại (admin) 
    -----------------------------------
 👤 NGƯỜI DÙNG:                                   
   ${prefix}profile – Hồ sơ cá nhân               
   ${prefix}top    – Bảng xếp hạng tương tác      
   ${prefix}daily  – Điểm danh nhận thưởng        
   ${prefix}rank   – Cấp bậc của bạn
   -----------------------------------
 🛡️ QUẢN TRỊ (ADMIN):                             
   ${prefix}admin add @tag – Thêm admin           
   ${prefix}admin del @tag – Xóa admin            
   ${prefix}mute @tag [phút]                      
   ${prefix}unmute @tag                           
   ${prefix}ban @tag   – Cấm người dùng           
   ${prefix}unban @tag – Bỏ cấm                   
   ${prefix}log      – Đặt nhóm log               
   ${prefix}broadcast [tin nhắn] – Gửi tin        
   ---------------------------------------
 🛡️ CHỐNG SPAM & BẢO VỆ:                          
   ${prefix}antispam on/off                       
   ${prefix}antiword [từ] – Thêm từ cấm           
   ${prefix}whitelist add @tag                    
   --------------------------------------
 🧠 AI & TIỆN ÍCH:                                 
   ${prefix}ai [câu hỏi] – Hỏi AI                  
   ${prefix}translate [văn bản] – Dịch             
   ${prefix}weather [địa điểm] – Thời tiết         
   ${prefix}shorten [url] – Rút gọn link           
   ${prefix}qr [nội dung] – Tạo mã QR
   ------------------------------------
 🎮 MINI GAME:                                     
   ${prefix}dice   – Tung xúc xắc                  
   ${prefix}coin   – Tung đồng xu                  
   ${prefix}guess  – Đoán số (1-100)               
   ${prefix}quiz   – Câu đố vui                    
   ${prefix}reaction – Kiểm tra phản xạ
   ------------------------------------
 💰 KINH TẾ ẢO:                                    
   ${prefix}bal    – Xem số dư
   ${prefix}shop   – Cửa hàng                      
   ${prefix}buy [mã] – Mua vật phẩm                
   ${prefix}inventory – Kho đồ
   ----------------------------------
 🔎 TÌM KIẾM:                                     
   ${prefix}wiki [từ khóa] – Wikipedia            
   ${prefix}calc [biểu thức] – Máy tính           
   ${prefix}time [múi giờ] – Thời gian 
   -----------------------------------
 📊 THỐNG KÊ:                                      
   ${prefix}stats – Thống kê bot                   
   ${prefix}topcmd – Lệnh dùng nhiều nhất          
╚═══════════════════════════════════════════╝
    `;
}

// ============================================================
// 🤖 XỬ LÝ TIN NHẮN CHÍNH (async)
// ============================================================
async function handleMessage(api, message) {
    try {
        if (!message || !message.body) return;
        const threadID = message.threadID;
        const senderID = message.senderID;
        const body = message.body.trim();
        const mentions = message.mentions || {};
        const prefix = config.prefix;

        // Kiểm tra blacklist
        if (blacklist.users.includes(senderID)) {
            api.sendMessage(`🚫 Bạn đã bị cấm sử dụng ${BOT_NAME}.`, threadID);
            return;
        }
        if (blacklist.groups.includes(threadID)) return;

        // Tự động thêm admin đầu tiên
        if (config.adminIDs.length === 0 && body.startsWith(prefix)) {
            config.adminIDs.push(senderID);
            saveJSON(CONFIG_FILE, config);
            logToFile(`Admin đầu tiên: ${senderID}`);
            api.sendMessage(`👑 Bạn đã trở thành admin của ${BOT_NAME}.`, threadID);
        }

        // Cập nhật thống kê
        stats.totalMsg = (stats.totalMsg || 0) + 1;
        if (!stats[threadID]) stats[threadID] = {};
        stats[threadID][senderID] = (stats[threadID][senderID] || 0) + 1;
        saveJSON(STATS_FILE, stats);

        // Cộng EXP
        if (!body.startsWith(prefix)) {
            addExp(senderID, 1);
            let botID = getUID(api);
            if (botID && mentions[botID]) {
                const replies = [
                    `${BOT_NAME} đây! 😎`,
                    'KuKem Ngủ Rồi! 😴',
                    'À ố sì mà 🚀'
                ];
                api.sendMessage(replies[Math.floor(Math.random() * replies.length)], threadID);
                return;
            }
            return;
        }

        // Lệnh
        const content = body.slice(prefix.length).trim();
        if (!content) return;
        const args = content.split(/\s+/);
        const cmd = args.shift().toLowerCase();

        stats.cmdCount[cmd] = (stats.cmdCount[cmd] || 0) + 1;
        saveJSON(STATS_FILE, stats);

        // ============================================================
        // 📋 MENU / HELP
        // ============================================================
        if (cmd === 'help' || cmd === 'menu') {
            api.sendMessage(getMainMenu(prefix), threadID);
            return;
        }

        // ============================================================
        // ℹ️ INFO (đã thêm tên bot)
        // ============================================================
        if (cmd === 'info') {
            let botID = getUID(api);
            let uptime = moment.duration(Date.now() - config.startTime).humanize();
            let msg = `
╔════════════════════════════╗
║  🤖 THÔNG TIN ${BOT_NAME}  ║
╠════════════════════════════╣
║  Tên: ${BOT_NAME}
║  Phiên bản: ${BOT_VERSION}
║  ID: ${botID || 'N/A'}
║  Prefix: ${prefix}
║  Admin: ${config.adminIDs.length}
║  Nhóm: ${Object.keys(stats).length}
║  Tin nhắn: ${stats.totalMsg}
║  Uptime: ${uptime}
╚════════════════════════════╝
            `;
            api.sendMessage(msg, threadID);
            return;
        }

        // ============================================================
        // 🏓 PING (thêm tên)
        // ============================================================
        if (cmd === 'ping') {
            let start = Date.now();
            api.sendMessage(`⏳ ${BOT_NAME} đang đo ping...`, threadID, (err) => {
                if (err) return;
                let ping = Date.now() - start;
                api.sendMessage(`🏓 Pong! Độ trễ: ${ping}ms`, threadID);
            });
            return;
        }

        // ============================================================
        // ⏱ UPTIME
        // ============================================================
        if (cmd === 'uptime') {
            let up = moment.duration(Date.now() - config.startTime).humanize();
            api.sendMessage(`⏱ ${BOT_NAME} đã hoạt động: ${up}`, threadID);
            return;
        }

        // ============================================================
        // ⚙️ PREFIX
        // ============================================================
        if (cmd === 'prefix') {
            if (!isAdmin(senderID)) {
                api.sendMessage(`❌ Chỉ admin mới đổi prefix. Prefix hiện tại: ${prefix}`, threadID);
                return;
            }
            if (args[0]) {
                let newP = args[0];
                if (newP.length > 5) return api.sendMessage('❌ Prefix tối đa 5 ký tự.', threadID);
                config.prefix = newP;
                saveJSON(CONFIG_FILE, config);
                api.sendMessage(`✅ Prefix đã đổi thành: ${newP}`, threadID);
            } else {
                api.sendMessage(`🔧 Prefix hiện tại: ${prefix}`, threadID);
            }
            return;
        }

        // ============================================================
        // 🔄 RESTART
        // ============================================================
        if (cmd === 'restart') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            api.sendMessage(`🔄 ${BOT_NAME} đang khởi động lại...`, threadID);
            logToFile(`Restart bởi ${senderID}`);
            process.exit(0);
        }

        // ============================================================
        // 👤 PROFILE
        // ============================================================
        if (cmd === 'profile') {
            let target = Object.keys(mentions)[0] || senderID;
            let lv = getUserLevelFromExp(target);
            let bal = getBalance(target);
            let level = getUserLevel(target);
            let msg = `
╔════════════════════════════╗
║  👤 HỒ SƠ CÁ NHÂN         ║
╠════════════════════════════╣
║  ID: ${target}
║  Cấp bậc: ${level}
║  Level: ${lv.level} (EXP: ${lv.exp}/${lv.next})
║  Số dư: ${bal} coin
║  Số tin nhắn: ${stats[threadID]?.[target] || 0}
╚════════════════════════════╝
            `;
            api.sendMessage(msg, threadID);
            return;
        }

        // ============================================================
        // 🏆 TOP
        // ============================================================
        if (cmd === 'top' || cmd === 'xephang') {
            let data = stats[threadID] || {};
            let sorted = Object.entries(data).sort((a,b) => b[1]-a[1]).slice(0,10);
            if (!sorted.length) return api.sendMessage('📭 Chưa có dữ liệu.', threadID);
            let msg = '🏆 BẢNG XẾP HẠNG TƯƠNG TÁC\n';
            sorted.forEach(([id, count], i) => {
                let medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`;
                msg += `${medal} ${id} → ${count} tin\n`;
            });
            api.sendMessage(msg, threadID);
            return;
        }

        // ============================================================
        // 🎁 DAILY
        // ============================================================
        if (cmd === 'daily') {
            let now = Date.now();
            let last = users[senderID]?.daily || 0;
            if (now - last < 24*3600*1000) {
                let remain = moment.duration(24*3600*1000 - (now - last)).humanize();
                return api.sendMessage(`⏳ Bạn đã nhận rồi, chờ ${remain} nữa.`, threadID);
            }
            let reward = 500 + Math.floor(Math.random() * 500);
            addBalance(senderID, reward);
            if (!users[senderID]) users[senderID] = {};
            users[senderID].daily = now;
            saveJSON(USERDATA_FILE, users);
            api.sendMessage(`🎁 Bạn nhận được ${reward} coin!`, threadID);
            return;
        }

        // ============================================================
        // 📊 BALANCE
        // ============================================================
        if (cmd === 'bal' || cmd === 'balance') {
            let target = Object.keys(mentions)[0] || senderID;
            api.sendMessage(`💰 ${target} có ${getBalance(target)} coin.`, threadID);
            return;
        }

        // ============================================================
        // 💸 TRANSFER
        // ============================================================
        if (cmd === 'transfer') {
            let target = Object.keys(mentions)[0];
            let amount = parseInt(args[1]);
            if (!target || !amount || amount <= 0) return api.sendMessage('❌ Dùng: transfer @tag số', threadID);
            if (getBalance(senderID) < amount) return api.sendMessage('❌ Không đủ coin.', threadID);
            addBalance(senderID, -amount);
            addBalance(target, amount);
            api.sendMessage(`✅ Đã chuyển ${amount} coin cho ${target}`, threadID);
            return;
        }

        // ============================================================
        // 🛒 SHOP / BUY / INVENTORY
        // ============================================================
        if (cmd === 'shop') {
            let items = ['🎫 VIP (1000)', '🌟 Tên màu (500)', '🎁 Gói EXP (300)'];
            api.sendMessage(`🛒 CỬA HÀNG:\n${items.map((i,idx) => `${idx+1}. ${i}`).join('\n')}`, threadID);
            return;
        }
        if (cmd === 'buy') {
            let item = args[0];
            if (item === '1' || item === 'vip') {
                if (getBalance(senderID) < 1000) return api.sendMessage('❌ Cần 1000 coin.', threadID);
                addBalance(senderID, -1000);
                if (!users[senderID]) users[senderID] = {};
                users[senderID].vip = true;
                saveJSON(USERDATA_FILE, users);
                api.sendMessage('🎉 Bạn đã mua VIP thành công!', threadID);
            } else {
                api.sendMessage('❌ Mã không hợp lệ. Xem shop.', threadID);
            }
            return;
        }
        if (cmd === 'inventory') {
            let vip = users[senderID]?.vip ? 'VIP ✅' : 'Không';
            api.sendMessage(`🎒 Kho đồ của bạn:\nVIP: ${vip}`, threadID);
            return;
        }

        // ============================================================
        // 👑 ADMIN MANAGEMENT
        // ============================================================
        if (cmd === 'admin') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let action = args[0];
            let target = Object.keys(mentions)[0];
            if (action === 'add' && target) {
                if (!config.adminIDs.includes(target)) {
                    config.adminIDs.push(target);
                    saveJSON(CONFIG_FILE, config);
                    api.sendMessage(`✅ Thêm ${target} làm admin.`, threadID);
                } else api.sendMessage('❌ Đã là admin.', threadID);
            } else if (action === 'del' && target) {
                config.adminIDs = config.adminIDs.filter(id => id !== target);
                saveJSON(CONFIG_FILE, config);
                api.sendMessage(`✅ Xóa admin ${target}.`, threadID);
            } else {
                api.sendMessage(`Sử dụng: ${prefix}admin add @tag | ${prefix}admin del @tag`, threadID);
            }
            return;
        }

        // ============================================================
        // 🔇 MUTE / UNMUTE
        // ============================================================
        if (cmd === 'mute') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            let minutes = parseInt(args[1]) || 10;
            if (!target) return api.sendMessage('❌ Tag người cần mute.', threadID);
            muteUser(api, threadID, target, minutes);
            logToThread(api, `${senderID} mute ${target} ${minutes} phút.`);
       return;
        }
        if (cmd === 'unmute') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            if (!target) return api.sendMessage('❌ Tag người cần unmute.', threadID);
            if (mutedUsers[threadID] && mutedUsers[threadID][target]) {
                clearTimeout(mutedUsers[threadID][target]);
                delete mutedUsers[threadID][target];
                api.sendMessage(`✅ Đã gỡ mute ${target}.`, threadID);
            } else api.sendMessage('❌ Người này không bị mute.', threadID);
            return;
        }

        // ============================================================
        // 🚫 BAN / UNBAN
        // ============================================================
        if (cmd === 'ban') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            if (!target) return api.sendMessage('❌ Tag người cần ban.', threadID);
            if (!blacklist.users.includes(target)) {
                blacklist.users.push(target);
                saveJSON(BLACKLIST_FILE, blacklist);
                api.sendMessage(`✅ Đã ban ${target}.`, threadID);
            } else api.sendMessage('❌ Đã bị ban.', threadID);
            return;
        }
        if (cmd === 'unban') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let target = Object.keys(mentions)[0] || args[0];
            if (!target) return api.sendMessage('❌ Tag người cần unban.', threadID);
            blacklist.users = blacklist.users.filter(id => id !== target);
            saveJSON(BLACKLIST_FILE, blacklist);
            api.sendMessage(`✅ Đã unban ${target}.`, threadID);
            return;
        }

        // ============================================================
        // 📝 LOG
        // ============================================================
        if (cmd === 'log') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            config.logThreadID = threadID;
            saveJSON(CONFIG_FILE, config);
            api.sendMessage('✅ Nhóm này nhận log.', threadID);
            return;
        }

        // ============================================================
        // 📢 BROADCAST
        // ============================================================
        if (cmd === 'broadcast') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let msg = args.join(' ');
            if (!msg) return api.sendMessage('❌ Nhập nội dung.', threadID);
            let threads = Object.keys(stats);
            let count = 0;
            threads.forEach(tid => {
                if (tid !== threadID) {
                    api.sendMessage(`📢 ${msg}`, tid, (e) => { if(!e) count++; });
                }
            });
            api.sendMessage(`✅ Đã gửi broadcast đến ${count} nhóm.`, threadID);
            logToThread(api, `Broadcast: ${msg}`);
            return;
        }

        // ============================================================
        // 🧠 AI
        // ============================================================
        if (cmd === 'ai') {
            let query = args.join(' ');
            if (!query) return api.sendMessage('❌ Nhập câu hỏi.', threadID);
            api.sendMessage('⏳ Đang suy nghĩ...', threadID);
            try {
                let resp = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(query)}`);
                let reply = resp.data.response || 'Không hiểu.';
                api.sendMessage(`🤖 ${reply}`, threadID);
            } catch(e) {
                api.sendMessage('❌ Lỗi AI.', threadID);
            }
            return;
        }

        // ============================================================
        // 🌤 WEATHER
        // ============================================================
        if (cmd === 'weather') {
            let place = args.join(' ') || 'Hanoi';
            try {
                let resp = await axios.get(`https://wttr.in/${encodeURIComponent(place)}?format=%C+%t+%w`);
                api.sendMessage(`🌤 Thời tiết ${place}: ${resp.data}`, threadID);
            } catch(e) {
                api.sendMessage('❌ Không lấy được thời tiết.', threadID);
            }
            return;
        }

        // ============================================================
        // 🔗 SHORTEN URL
        // ============================================================
        if (cmd === 'shorten') {
            let url = args[0];
            if (!url) return api.sendMessage('❌ Nhập URL.', threadID);
            try {
                let resp = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
                api.sendMessage(`🔗 Rút gọn: ${resp.data}`, threadID);
            } catch(e) {
                api.sendMessage('❌ Lỗi rút gọn.', threadID);
            }
            return;
        }

        // ============================================================
        // 📱 QR CODE
        // ============================================================
        if (cmd === 'qr') {
            let text = args.join(' ') || 'https://facebook.com';
            api.sendMessage(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=300x300`, threadID);
            return;
        }

        // ============================================================
        // 🎮 MINI GAMES
        // ============================================================
        if (cmd === 'dice') {
            let result = Math.floor(Math.random() * 6) + 1;
            api.sendMessage(`🎲 Bạn tung được: ${result}`, threadID);
            return;
        }
        if (cmd === 'coin') {
            let result = Math.random() < 0.5 ? 'Ngửa' : 'Sấp';
            api.sendMessage(`🪙 Tung đồng xu: ${result}`, threadID);
            return;
        }
        if (cmd === 'guess') {
            let num = Math.floor(Math.random() * 100) + 1;
            if (!users[senderID]) users[senderID] = {};
            users[senderID].guessNumber = num;
            saveJSON(USERDATA_FILE, users);
            api.sendMessage('🔢 Tôi đã nghĩ một số 1-100. Hãy đoán!', threadID);
            return;
        }

        // ============================================================
        // 📊 STATS
        // ============================================================
        if (cmd === 'stats') {
            let msg = `
📊 THỐNG KÊ ${BOT_NAME}
Tổng tin nhắn: ${stats.totalMsg}
Số nhóm: ${Object.keys(stats).length}
Số lệnh: ${Object.keys(stats.cmdCount || {}).length}
Admin: ${config.adminIDs.length}
Uptime: ${moment.duration(Date.now() - config.startTime).humanize()}
            `;
            api.sendMessage(msg, threadID);
            return;
        }
        if (cmd === 'topcmd') {
            let sorted = Object.entries(stats.cmdCount || {}).sort((a,b) => b[1]-a[1]).slice(0,5);
            if (!sorted.length) return api.sendMessage('Chưa có dữ liệu.', threadID);
            let msg = '📋 LỆNH DÙNG NHIỀU NHẤT:\n';
            sorted.forEach(([c, count]) => msg += `${c}: ${count} lần\n`);
            api.sendMessage(msg, threadID);
            return;
        }

        // ============================================================
        // ⚙️ CÀI ĐẶT CHỐNG SPAM
        // ============================================================
        if (cmd === 'antispam') {
            if (!isAdmin(senderID)) return api.sendMessage('❌ Chỉ admin.', threadID);
            let status = args[0];
            if (status === 'on') { settings.anti_spam = true; saveJSON(SETTINGS_FILE, settings); api.sendMessage('✅ Bật chống spam.', threadID); }
            else if (status === 'off') { settings.anti_spam = false; saveJSON(SETTINGS_FILE, settings); api.sendMessage('❌ Tắt chống spam.', threadID); }
            else api.sendMessage(`Trạng thái: ${settings.anti_spam ? 'Bật' : 'Tắt'}`, threadID);
            return;
        }

        // ============================================================
        // 📌 LỆNH KHÔNG HỢP LỆ
        // ============================================================
        let unknownMsg = `❌ Lệnh không rõ. Gõ ${prefix}help để xem menu.`;
        api.sendMessage(unknownMsg, threadID);

    } catch (error) {
        console.error('LỖI HANDLE:', error);
        logToFile(`ERROR: ${error}`);
    }
}

// ============================================================
// 🔐 ĐĂNG NHẬP FACEBOOK + RECONNECT AN TOÀN
// ============================================================

let apiInstance = null;
let reconnectTimer = null;
let isConnecting = false;
let isListening = false;

// Đọc APPSTATE từ Environment Variable
function getAppState() {
    try {
        const raw = process.env.APPSTATE;

        if (!raw) {
            throw new Error('Không tìm thấy biến môi trường APPSTATE');
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('APPSTATE phải là một mảng JSON không rỗng');
        }

        // Kiểm tra cookie cơ bản
        const requiredCookies = ['c_user', 'xs'];
        const cookieKeys = parsed.map(c => c.key);

        for (const key of requiredCookies) {
            if (!cookieKeys.includes(key)) {
                throw new Error(`APPSTATE thiếu cookie bắt buộc: ${key}`);
            }
        }

        console.log(`🍪 APPSTATE hợp lệ: ${parsed.length} cookies`);

        return parsed;

    } catch (error) {
        console.error('❌ APPSTATE lỗi:', error.message);
        return null;
    }
}


// ============================================================
// 🎧 LẮNG NGHE MQTT
// ============================================================

function startListening(api) {

    if (isListening) {
        console.log('⚠️ MQTT listener đã chạy, bỏ qua.');
        return;
    }

    isListening = true;
    apiInstance = api;

    console.log(`👂 ${BOT_NAME} đang lắng nghe tin nhắn...`);

    api.listenMqtt(async (err, msg) => {

        if (err) {

            console.error(
                `❌ MQTT lỗi (${BOT_NAME}):`,
                err.errorDescription ||
                err.errorSummary ||
                err.message ||
                err
            );

            logToFile(
                `MQTT lỗi: ${JSON.stringify(err)}`
            );

            isListening = false;

            scheduleReconnect();

            return;
        }

        if (!msg) return;

        if (msg.type === 'message') {

            try {
                await handleMessage(api, msg);

            } catch (error) {

                console.error(
                    '❌ HANDLE MESSAGE:',
                    error
                );

                logToFile(
                    `HANDLE ERROR: ${error.stack || error}`
                );
            }
        }
    });
}


// ============================================================
// 🔄 TỰ ĐỘNG KẾT NỐI LẠI
// ============================================================

function scheduleReconnect() {

    if (reconnectTimer) {
        console.log('⏳ Đã có lịch reconnect.');
        return;
    }

    reconnectTimer = setTimeout(() => {

        reconnectTimer = null;

        console.log(
            `🔄 ${BOT_NAME} đang thử kết nối lại...`
        );

        loginFacebook();

    }, 10000);
}


// ============================================================
// 🔑 LOGIN FACEBOOK
// ============================================================

function loginFacebook() {

    if (isConnecting) {
        console.log('⏳ Đang có một phiên đăng nhập.');
        return;
    }

    isConnecting = true;

    const appState = getAppState();

    if (!appState) {

        isConnecting = false;

        console.error(
            '❌ Không thể đăng nhập vì APPSTATE không hợp lệ.'
        );

        // Thử lại sau 30 giây
        reconnectTimer = setTimeout(() => {

            reconnectTimer = null;

            loginFacebook();

        }, 30000);

        return;
    }

    console.log(
        `🔐 ${BOT_NAME} đang đăng nhập Facebook...`
    );

    login(
        {
            appState: appState,

            // Một số phiên cần các tùy chọn này
            forceLogin: false,
            listenEvents: true,
            selfListen: true,

            // Không tự động logout
            autoMarkDelivery: false,
            autoMarkRead: false
        },

        (err, api) => {

            isConnecting = false;

            if (err) {

                console.error(
                    `❌ ${BOT_NAME} đăng nhập thất bại:`
                );

                console.error(
                    err.errorDescription ||
                    err.errorSummary ||
                    err.message ||
                    err
                );

                logToFile(
                    `LOGIN ERROR: ${JSON.stringify(err)}`
                );

                // Nếu Facebook trả về Not logged in
                if (
                    err.errorDescription === 'Not logged in' ||
                    err.error === 1357004
                ) {

                    console.error(
                        '⚠️ APPSTATE đã hết hạn hoặc Facebook từ chối phiên đăng nhập.'
                    );

                    console.error(
                        '⚠️ Hãy lấy APPSTATE mới rồi cập nhật trên Render.'
                    );
                }

                scheduleReconnect();

                return;
            }


            // ================================================
            // LOGIN THÀNH CÔNG
            // ================================================

            apiInstance = api;

            console.log(
                `✅ ${BOT_NAME} đăng nhập Facebook thành công!`
            );

            try {

                api.setOptions({
                    listenEvents: true,
                    selfListen: true,
                    autoMarkDelivery: false,
                    autoMarkRead: false
                });

            } catch (e) {

                console.warn(
                    '⚠️ Không thể setOptions:',
                    e.message
                );
            }


            // Lấy UID bot
            let botID = null;

            try {
                botID = api.getCurrentUserID();
            } catch (e) {
                console.warn(
                    '⚠️ Không lấy được UID bot:',
                    e.message
                );
            }


            console.log(
                `🤖 ${BOT_NAME} UID: ${botID || 'N/A'}`
            );

            logToFile(
                `${BOT_NAME} LOGIN SUCCESS - UID: ${botID || 'N/A'}`
            );


            // Bắt đầu MQTT
            startListening(api);
        }
    );
}


// ============================================================
// 🚀 KHỞI ĐỘNG BOT
// ============================================================

console.log(`
╔══════════════════════════════════════╗
║       🤖 ${BOT_NAME} v${BOT_VERSION}
║       🚀 ĐANG KHỞI ĐỘNG...
╚══════════════════════════════════════╝
`);

loginFacebook();

// ============================================================
// 🛡️ XỬ LÝ LỖI TOÀN CỤC
// ============================================================
process.on('uncaughtException', (e) => {
    console.error(`❌ Exception (${BOT_NAME}):`, e);
    logToFile(`Exception: ${e}`);
});
process.on('unhandledRejection', (e) => {
    console.error(`❌ Rejection (${BOT_NAME}):`, e);
    logToFile(`Rejection: ${e}`);
});
