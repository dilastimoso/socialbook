let dbx;
let currentUser = null;
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
function aiSafetyScan(t) { return !(/hate|kill|stupid|scam|violence/i.test(t)); }

/* --- UI SWITCHING --- */
function switchView(viewName, el) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    
    document.getElementById('view-feed').style.display = 'none';
    document.getElementById('view-messages').style.display = 'none';
    
    document.getElementById(`view-${viewName}`).style.display = viewName === 'feed' ? 'flex' : 'block';
    if(viewName === 'messages') loadMessages();
}

/* --- IMAGE HELPER (Base64) --- */
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

/* --- AUTH --- */
async function getUsersDB() {
    try {
        const file = await dbx.filesDownload({ path: '/socialbook_system/users.json' });
        return JSON.parse(await file.result.fileBlob.text());
    } catch(e) { return {}; }
}

async function handleRegister() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    if(!u || !p) return alert("Fill all fields");
    
    const db = await getUsersDB();
    if(db[u]) return alert("Taken");
    db[u] = hashPassword(p);
    
    await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
    alert("Created!");
}

async function handleLogin() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    const loading = document.getElementById('login-loading');
    
    loading.style.display = 'block';
    const db = await getUsersDB();
    if(db[u] === hashPassword(p)) {
        currentUser = u;
        document.getElementById('auth-modal').style.display = 'none';
        document.querySelector('.user-status').innerText = u;
        loadFeed();
        // Start polling loop
        setInterval(loadMessages, 3000); 
    } else {
        alert("Invalid");
    }
    loading.style.display = 'none';
}

/* --- FEED POSTS --- */
async function createPost() {
    if(!currentUser) return;
    const txt = document.getElementById('post-input').value;
    const fileInput = document.getElementById('post-image');
    
    if(!txt && !fileInput.files[0]) return;
    if(!aiSafetyScan(txt)) return alert("Content Violation");

    let imgData = null;
    if(fileInput.files[0]) {
        imgData = await toBase64(fileInput.files[0]);
    }

    const data = { author: currentUser, content: txt, image: imgData, date: new Date().toLocaleString() };
    await dbx.filesUpload({ path: `/socialbook_posts/${Date.now()}.json`, contents: encryptData(data) });
    
    document.getElementById('post-input').value = '';
    fileInput.value = '';
    loadFeed();
}

async function loadFeed() {
    const container = document.getElementById('feed-stream');
    try {
        const list = await dbx.filesListFolder({ path: '/socialbook_posts' });
        const files = list.result.entries.sort((a,b) => b.name.localeCompare(a.name));
        container.innerHTML = '';
        
        for(const f of files) {
            if(!f.name.endsWith('.json')) continue;
            const down = await dbx.filesDownload({ path: f.path_lower });
            const post = decryptData(await down.result.fileBlob.text());
            if(post) renderPost(post, container);
        }
    } catch(e) {}
}

function renderPost(post, container) {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    div.innerHTML = `
        <div class="post-header">
            <div class="avatar">${post.author[0].toUpperCase()}</div>
            <div>
                <div class="username">${post.author}</div>
                <div class="timestamp">${post.date}</div>
            </div>
        </div>
        <div>${post.content}</div>
        ${post.image ? `<img src="${post.image}" class="post-img">` : ''}
        <div style="margin-top:15px; display:flex; gap:15px; color:#555; border-top:1px solid #eee; padding-top:10px;">
            <span><i class="far fa-thumbs-up"></i> Like</span>
            <span><i class="far fa-comment"></i> Comment</span>
        </div>
    `;
    container.appendChild(div);
}

/* --- MESSENGER --- */
async function sendMessage() {
    if(!currentUser) return;
    const txt = document.getElementById('msg-input').value;
    const fileInput = document.getElementById('msg-image');
    
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const data = { author: currentUser, text: txt, image: imgData };
    await dbx.filesUpload({ path: `/socialbook_messages/${Date.now()}.json`, contents: encryptData(data) });
    
    document.getElementById('msg-input').value = '';
    fileInput.value = '';
    loadMessages();
}

async function loadMessages() {
    // Only load if visible
    if(document.getElementById('view-messages').style.display === 'none') return;
    
    const container = document.getElementById('chat-window');
    try {
        // Create folder if not exists
        try { await dbx.filesCreateFolderV2({ path: '/socialbook_messages' }); } catch(e){}

        const list = await dbx.filesListFolder({ path: '/socialbook_messages' });
        const files = list.result.entries.sort((a,b) => a.name.localeCompare(b.name)); // Oldest first
        
        // Simple diff check to avoid flickering could be done here, but full redraw is safer for patch
        container.innerHTML = '';

        for(const f of files) {
            const down = await dbx.filesDownload({ path: f.path_lower });
            const msg = decryptData(await down.result.fileBlob.text());
            if(msg) {
                const isMine = msg.author === currentUser;
                const div = document.createElement('div');
                div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}`;
                div.innerHTML = `
                    <div style="font-size:0.7rem; opacity:0.7; margin-bottom:2px;">${msg.author}</div>
                    ${msg.text}
                    ${msg.image ? `<br><img src="${msg.image}" style="max-width:200px; border-radius:10px; margin-top:5px;">` : ''}
                `;
                container.appendChild(div);
            }
        }
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch(e){}
}

/* --- VIDEO CALL (FACETIME STYLE) --- */
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
    await new Promise(r => setTimeout(r, 1000));
    
    await dbx.filesUpload({ path: '/socialbook_calls/offer.json', contents: encryptData(peerConnection.localDescription), mode: 'overwrite' });
    document.getElementById('video-status').innerText = "Ringing...";
    
    // Poll for answer
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
    document.getElementById('video-status').innerText = "Connecting...";
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
