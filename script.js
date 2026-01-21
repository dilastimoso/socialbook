let dbx;
let currentUser = null;
let currentChatPartner = null; 
let viewedProfile = null; 
const GLOBAL_NET_KEY = "SocialBook_Universal_Link_2026"; 

// --- PERMANENT AUTH CONFIGURATION ---
// 1. Enter your App Key and Secret from Dropbox Console
const APP_KEY = "gxrv17n6zjg8dl3"; 
const APP_SECRET = "q6wdhrgbqm8j5ef"; 

// 2. Enter the Refresh Token you got from setup.html
const REFRESH_TOKEN = "JSSOwkEXqmIAAAAAAAAAO6VMyQChG66u7z8iq_4zLfE";

let peerConnection;
let localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

document.addEventListener('DOMContentLoaded', () => {
    // This connects using the Refresh Token, which auto-renews forever.
    dbx = new Dropbox.Dropbox({ 
        clientId: APP_KEY, 
        clientSecret: APP_SECRET, 
        refreshToken: REFRESH_TOKEN 
    });
});

/* --- UTILS --- */
function encryptData(data) { return CryptoJS.AES.encrypt(JSON.stringify(data), GLOBAL_NET_KEY).toString(); }
function decryptData(cipher) { try { return JSON.parse(CryptoJS.AES.decrypt(cipher, GLOBAL_NET_KEY).toString(CryptoJS.enc.Utf8)); } catch(e){return null;} }
function hashPassword(p) { return CryptoJS.SHA256(p).toString(); }
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); reader.onerror = reject;
});

/* --- UI SWITCHING --- */
function switchView(viewName, el) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    
    document.getElementById('view-feed').style.display = 'none';
    document.getElementById('view-messages').style.display = 'none';
    document.getElementById('view-timeline').style.display = 'none';
    
    document.getElementById(`view-${viewName}`).style.display = viewName === 'feed' ? 'flex' : 'block';
    
    if(viewName === 'feed') loadFeed();
    if(viewName === 'messages') {
        renderFriendList();
        loadMessages();
    }
}

/* --- AUTH & FRIENDS --- */
async function getUsersDB() {
    try {
        const file = await dbx.filesDownload({ path: '/socialbook_system/users.json' });
        return JSON.parse(await file.result.fileBlob.text());
    } catch(e) { 
        // If file is missing (new app), return empty DB
        const err = JSON.stringify(e);
        if(err.includes('path/not_found')) return {};
        
        // If Auth fails despite Refresh Token, alert user
        if(err.includes('400') || err.includes('401')) {
            alert("Auth Error: Check your App Key/Secret/Refresh Token in script.js");
        }
        return {};
    }
}

async function handleRegister() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    if(!u || !p) return alert("Fill fields");
    
    try {
        const db = await getUsersDB();
        if(db[u]) return alert("Username Taken");
        db[u] = { pass: hashPassword(p), friends: [] }; 
        await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
        alert("Account Created!");
    } catch(e) { alert("Registration Failed"); }
}

async function handleLogin() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    document.getElementById('login-loading').style.display = 'block';
    
    try {
        const db = await getUsersDB();
        const stored = db[u];
        const valid = (typeof stored === 'string' && stored === hashPassword(p)) || (stored && stored.pass === hashPassword(p));

        if(valid) {
            currentUser = u;
            document.getElementById('auth-modal').style.display = 'none';
            document.querySelector('.user-status').innerText = u;
            loadFeed();
            setInterval(loadMessages, 3000); 
        } else {
            alert("Invalid Credentials");
        }
    } catch(e) {}
    document.getElementById('login-loading').style.display = 'none';
}

/* --- POSTS (FEED & TIMELINE) --- */
async function createPost() {
    if(!currentUser) return;
    const txt = document.getElementById('post-input').value;
    const fileInput = document.getElementById('post-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const data = { 
        id: Date.now(), 
        author: currentUser, 
        content: txt, 
        image: imgData, 
        date: new Date().toLocaleString(),
        likes: [], 
        comments: [] 
    };
    await dbx.filesUpload({ path: `/socialbook_posts/${data.id}.json`, contents: encryptData(data) });
    document.getElementById('post-input').value = '';
    fileInput.value = '';
    loadFeed();
}

async function loadFeed(filterUser = null) {
    const container = filterUser ? document.getElementById('timeline-stream') : document.getElementById('feed-stream');
    try {
        const list = await dbx.filesListFolder({ path: '/socialbook_posts' });
        const files = list.result.entries.sort((a,b) => b.name.localeCompare(a.name));
        container.innerHTML = ''; 
        
        for(const f of files) {
            if(!f.name.endsWith('.json')) continue;
            const down = await dbx.filesDownload({ path: f.path_lower });
            const post = decryptData(await down.result.fileBlob.text());
            
            if(post) {
                if (filterUser && post.author !== filterUser) continue;
                renderPost(post, container, f.path_lower);
            }
        }
    } catch(e) {}
}

function renderPost(post, container, filePath) {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    const isLiked = post.likes && post.likes.includes(currentUser);
    
    div.innerHTML = `
        <div class="post-header">
            <div class="avatar" onclick="openTimeline('${post.author}')">${post.author[0].toUpperCase()}</div>
            <div>
                <div class="username" onclick="openTimeline('${post.author}')">${post.author}</div>
                <div class="timestamp">${post.date}</div>
            </div>
        </div>
        <div style="line-height: 1.6;">${post.content}</div>
        ${post.image ? `<img src="${post.image}" class="post-img">` : ''}
        
        <div class="post-actions">
            <div class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${filePath}')">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${post.likes ? post.likes.length : 0} Likes
            </div>
            <div class="action-btn" onclick="toggleCommentSection(this)">
                <i class="far fa-comment"></i> ${post.comments ? post.comments.length : 0} Comments
            </div>
        </div>

        <div class="comments-section">
            <div class="comments-list">
                ${(post.comments || []).map(c => `<div class="comment"><b>${c.author}:</b> ${c.text}</div>`).join('')}
            </div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <input type="text" class="input-modern" placeholder="Write a comment..." style="margin:0; padding:8px;">
                <button class="btn-modern" style="padding:8px 15px;" onclick="addComment('${filePath}', this)">Send</button>
            </div>
        </div>
    `;
    container.appendChild(div);
}

/* --- INTERACTIONS --- */
function toggleCommentSection(btn) {
    const section = btn.parentElement.nextElementSibling;
    section.style.display = section.style.display === 'block' ? 'none' : 'block';
}

async function toggleLike(filePath) {
    const down = await dbx.filesDownload({ path: filePath });
    const post = decryptData(await down.result.fileBlob.text());
    if(!post.likes) post.likes = [];
    
    if(post.likes.includes(currentUser)) {
        post.likes = post.likes.filter(u => u !== currentUser);
    } else {
        post.likes.push(currentUser);
    }
    await dbx.filesUpload({ path: filePath, contents: encryptData(post), mode: 'overwrite' });
    if(viewedProfile) loadFeed(viewedProfile); else loadFeed();
}

async function addComment(filePath, btn) {
    const input = btn.previousElementSibling;
    const text = input.value;
    if(!text) return;
    
    const down = await dbx.filesDownload({ path: filePath });
    const post = decryptData(await down.result.fileBlob.text());
    if(!post.comments) post.comments = [];
    
    post.comments.push({ author: currentUser, text: text, date: Date.now() });
    await dbx.filesUpload({ path: filePath, contents: encryptData(post), mode: 'overwrite' });
    if(viewedProfile) loadFeed(viewedProfile); else loadFeed();
}

/* --- TIMELINE & FRIENDS --- */
async function openTimeline(username) {
    viewedProfile = username;
    switchView('timeline');
    
    document.getElementById('profile-username').innerText = username;
    document.getElementById('profile-avatar-display').innerText = username[0].toUpperCase();
    
    const db = await getUsersDB();
    const myData = db[currentUser];
    const isFriend = myData.friends && myData.friends.includes(username);
    
    const btnAdd = document.getElementById('btn-add-friend');
    const btnMsg = document.getElementById('btn-msg-friend');
    
    if(username === currentUser) {
        btnAdd.style.display = 'none';
        btnMsg.style.display = 'none';
    } else if (isFriend) {
        btnAdd.style.display = 'none';
        btnMsg.style.display = 'inline-block';
    } else {
        btnAdd.style.display = 'inline-block';
        btnMsg.style.display = 'none';
    }
    
    loadFeed(username);
}

async function addFriendAction() {
    const db = await getUsersDB();
    if(!db[currentUser].friends) db[currentUser].friends = [];
    
    if(!db[currentUser].friends.includes(viewedProfile)) {
        db[currentUser].friends.push(viewedProfile);
        if(db[viewedProfile] && typeof db[viewedProfile] !== 'string') {
             if(!db[viewedProfile].friends) db[viewedProfile].friends = [];
             db[viewedProfile].friends.push(currentUser);
        }
        await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
        alert("Friend Added!");
        openTimeline(viewedProfile); 
    }
}

function messageFriendAction() {
    currentChatPartner = viewedProfile;
    switchView('messages');
}

/* --- MESSAGING --- */
async function renderFriendList() {
    const list = document.getElementById('msg-friend-list');
    const db = await getUsersDB();
    const myFriends = db[currentUser] ? (db[currentUser].friends || []) : [];
    
    let html = '<div style="padding: 10px; font-weight: bold; opacity: 0.5;">FRIENDS</div>';
    myFriends.forEach(f => {
        html += `<div class="friend-item ${currentChatPartner === f ? 'active' : ''}" onclick="selectChat('${f}')">
            <div style="width:30px;height:30px;background:#ddd;border-radius:50%;display:flex;align-items:center;justify-content:center;">${f[0]}</div>
            ${f}
        </div>`;
    });
    list.innerHTML = html;
}

function selectChat(friend) {
    currentChatPartner = friend;
    document.getElementById('chat-window').innerHTML = ''; 
    renderFriendList(); 
    loadMessages();
}

async function sendMessage() {
    if(!currentUser || !currentChatPartner) return alert("Select a friend");
    const txt = document.getElementById('msg-input').value;
    const fileInput = document.getElementById('msg-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const room = [currentUser, currentChatPartner].sort().join('_');
    const data = { id: Date.now(), author: currentUser, text: txt, image: imgData };
    
    await dbx.filesUpload({ path: `/socialbook_chats/${room}/${data.id}.json`, contents: encryptData(data) });
    
    document.getElementById('msg-input').value = '';
    fileInput.value = '';
    loadMessages();
}

async function loadMessages() {
    if(document.getElementById('view-messages').style.display === 'none' || !currentChatPartner) return;
    
    document.getElementById('chat-with-name').innerText = `Chat with ${currentChatPartner}`;
    const room = [currentUser, currentChatPartner].sort().join('_');
    const container = document.getElementById('chat-window');

    try {
        try { await dbx.filesCreateFolderV2({ path: `/socialbook_chats/${room}` }); } catch(e){}

        const list = await dbx.filesListFolder({ path: `/socialbook_chats/${room}` });
        const files = list.result.entries.sort((a,b) => a.name.localeCompare(b.name)); 
        
        for(const f of files) {
            const msgId = f.name.replace('.json', '');
            if(document.getElementById(`msg-${msgId}`)) continue; 

            const down = await dbx.filesDownload({ path: f.path_lower });
            const msg = decryptData(await down.result.fileBlob.text());
            if(msg) {
                const isMine = msg.author === currentUser;
                const div = document.createElement('div');
                div.id = `msg-${msgId}`; 
                div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}`;
                div.innerHTML = `
                    ${msg.text}
                    ${msg.image ? `<br><img src="${msg.image}" style="max-width:200px; border-radius:12px; margin-top:8px;">` : ''}
                `;
                container.appendChild(div);
                container.scrollTop = container.scrollHeight; 
            }
        }
    } catch(e){}
}

/* --- VIDEO CALL --- */
function openVideoModal() { document.getElementById('video-modal').style.display = 'flex'; initLocalVideo(); }
function closeVideo() { document.getElementById('video-modal').style.display = 'none'; if(localStream) localStream.getTracks().forEach(t=>t.stop()); }

async function initLocalVideo() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
}

async function startHost() {
    document.getElementById('video-status').innerText = "Calling...";
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await dbx.filesUpload({ path: '/socialbook_calls/offer.json', contents: encryptData(peerConnection.localDescription), mode: 'overwrite' });
    
    const checkLoop = setInterval(async () => {
        try {
            const f = await dbx.filesDownload({ path: '/socialbook_calls/answer.json' });
            const ans = decryptData(await f.result.fileBlob.text());
            if(ans) {
                await peerConnection.setRemoteDescription(ans);
                document.getElementById('video-status').innerText = "Connected";
                clearInterval(checkLoop);
            }
        } catch(e){}
    }, 2000);
}

async function startJoin() {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    const f = await dbx.filesDownload({ path: '/socialbook_calls/offer.json' });
    const offer = decryptData(await f.result.fileBlob.text());
    await peerConnection.setRemoteDescription(offer);
    const ans = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(ans);
    await dbx.filesUpload({ path: '/socialbook_calls/answer.json', contents: encryptData(peerConnection.localDescription), mode: 'overwrite' });
    document.getElementById('video-status').innerText = "Connected";
}
