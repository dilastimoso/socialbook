let dbx;
let currentUser = null;
let currentChatPartner = null; // Who are we messaging?
let viewedProfile = null; // Whose timeline are we on?
const GLOBAL_NET_KEY = "SocialBook_Universal_Link_2026"; 
const ACCESS_TOKEN = "sl.u.AGQZC-vOPB5s89pRFwIK9dWv8___s4aaQHWbK1BS4LKkcFsBhsR7aMZkHLmiDiXP4ALEboMeUMUyu0xmQpWN1AG41bO9QwJvsIaHeQ4avp1tZjFz5c8JxZCLjSyg49tgV_hbtil5XCpYwyaOvXA0TK09XPXhWDGY3VED30bh9iPdkgbDGRNMI55yi4I_LxCNE8x9ol_pxVWASJ3SwD0oIteD6CHtxzkmkTPX26mL_PwikB50iQr6m01YUGAvTb7vX0hU7X0A6uN3MnPHGJCBziVN9TcdP6bKYMlEGQLBfmRo554lTNZOsPdq5psJcMraLpgF0YlxnRDINBUi5XUgJfKd4ZJeiGOsOcD4O1u5oqDL2WKUutzRsaU4R5bOchAuubOLkZ9uTbMhDr4icD8BSr_ONGGYrv7Z-LoR9m_TEYNV7zJD0DFYQfUtgCYFvlo4AMOnQdq2TWFzG_pWlHUYhnqh2rVoCTHkg_ccpFXuUiBCeS_EjMJbeYj2bgSg6CVYuVU6kYIB25nwgl04Y26aRkS0D95B2aYcOtFC90LqydNuPZ-trhyq7T2zT6vkPcPKABEB25AqEVRZRUQwj7nuDeDh84ZE51yQydePRx4EJmqQOul9oJts8GyC9eHmGk2Edz6bU5xAwcUNORZudMh2n6mvEAIIxLK4s27t-gXyI1N8YQREE8ewJD0C1y2CfYELQibIGCNoeGj7S-qPIeM7MAsf0oOFNt5Td5zukRnkENFwaBoD7DSlUdidmqKWYEcH5U-O_4fa8OiIjCUj5gU8HGMaaWGog7Hz5Dlb74tToxjqkC-at-6OWEaTIt48_qY91yztRMOSqY3gRexHDKwGmoDVYD7Uty-UCHd314NAIgR-ww_EfyhFsVeCMEPgOpPjzC9mC_XfFTcA-oaljvM8HExlYg3TpknRoAM0ASG7ZID0fGsDEMiBawxnaKXfH7pcUZyT75RjkHc3ZgUSM4sLgqBrcMIqMBF_rp7IwvApNnQ7HtDAvj9dYFGBEj5VGMGomBf9sgvoAn6uNiQ-nMGk431iKZt99-Qa9rcLddbi3POt502n3TY83jeA9rYhs8VI1r-kX-z3IyQV-6HYtiBg8DE_9T78b9xxSRsm2Ek71R4DaNE-j-5bx2BKaWh0CkmiHiWuJL8UTZmF4CZ35CMyBuLoa2qqIken4BvyQDQuI47PgHM3PIkWPnBUCkozLB1FX5j-mJ-NzW3U3EMxF2t9kxKo7v-Cbq-9RbnyRfbGo_VvdOm6rQPPKUFABDF3XGbC-N0OljXeEEi4gR-Wk9edwVBdvHWYYyKsO0EabotvWSsI3Q";

let peerConnection;
let localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

document.addEventListener('DOMContentLoaded', () => {
    dbx = new Dropbox.Dropbox({ accessToken: ACCESS_TOKEN });
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
    } catch(e) { return {}; }
}

async function handleRegister() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    if(!u || !p) return alert("Fill fields");
    const db = await getUsersDB();
    if(db[u]) return alert("Username Taken");
    // User object now stores password hash AND friends list
    db[u] = { pass: hashPassword(p), friends: [] }; 
    await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
    alert("Account Created!");
}

async function handleLogin() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    document.getElementById('login-loading').style.display = 'block';
    const db = await getUsersDB();
    
    // Backward compatibility for old simple format, check object structure
    const stored = db[u];
    const valid = (typeof stored === 'string' && stored === hashPassword(p)) || (stored && stored.pass === hashPassword(p));

    if(valid) {
        currentUser = u;
        document.getElementById('auth-modal').style.display = 'none';
        document.querySelector('.user-status').innerText = u;
        loadFeed();
        setInterval(loadMessages, 3000); 
    } else {
        alert("Invalid");
    }
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
        container.innerHTML = ''; // Full refresh is okay for feed
        
        for(const f of files) {
            if(!f.name.endsWith('.json')) continue;
            const down = await dbx.filesDownload({ path: f.path_lower });
            const post = decryptData(await down.result.fileBlob.text());
            
            if(post) {
                // If on timeline, filter by user
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
    // Reload current view
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
    
    // Check friend status
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
        // Add me to their friends too (Mutual for simplicity)
        if(db[viewedProfile] && typeof db[viewedProfile] !== 'string') {
             if(!db[viewedProfile].friends) db[viewedProfile].friends = [];
             db[viewedProfile].friends.push(currentUser);
        }
        await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
        alert("Friend Added!");
        openTimeline(viewedProfile); // Refresh
    }
}

function messageFriendAction() {
    currentChatPartner = viewedProfile;
    switchView('messages');
}

/* --- MESSAGING (PRIVATE & BLINK FIX) --- */
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
    document.getElementById('chat-window').innerHTML = ''; // Clear only when switching chat
    renderFriendList(); // Update active state
    loadMessages();
}

async function sendMessage() {
    if(!currentUser || !currentChatPartner) return alert("Select a friend to chat");
    const txt = document.getElementById('msg-input').value;
    const fileInput = document.getElementById('msg-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    // Format: Participants sorted alphabetically to ensure unique room
    const room = [currentUser, currentChatPartner].sort().join('_');
    const data = { id: Date.now(), author: currentUser, text: txt, image: imgData };
    
    // Save to room folder
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
            // BLINK FIX: Check if message ID already exists in DOM
            const msgId = f.name.replace('.json', '');
            if(document.getElementById(`msg-${msgId}`)) continue; 

            const down = await dbx.filesDownload({ path: f.path_lower });
            const msg = decryptData(await down.result.fileBlob.text());
            if(msg) {
                const isMine = msg.author === currentUser;
                const div = document.createElement('div');
                div.id = `msg-${msgId}`; // Assign ID for duplicate check
                div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}`;
                div.innerHTML = `
                    ${msg.text}
                    ${msg.image ? `<br><img src="${msg.image}" style="max-width:200px; border-radius:12px; margin-top:8px;">` : ''}
                `;
                container.appendChild(div);
                container.scrollTop = container.scrollHeight; // Auto scroll
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
