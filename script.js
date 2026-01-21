/* --- FIREBASE CONFIGURATION --- */
const firebaseConfig = {
    apiKey: "AIzaSyCjcgPGmI9Y1AxAu5pCfP-MNpwp7YdCcrI",
    authDomain: "socialbook-93e5f.firebaseapp.com",
    projectId: "socialbook-93e5f",
    storageBucket: "socialbook-93e5f.firebasestorage.app",
    messagingSenderId: "260794751969",
    appId: "1:260794751969:web:c638b4aed54c42cace10a0",
    measurementId: "G-62GVYYQWFQ",
    databaseURL: "https://socialbook-93e5f-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentChatPartner = null;
let currentChatIsGroup = false;
let viewedProfile = null;
const GLOBAL_NET_KEY = "SocialBook_Universal_Link_2026";
let chatListenerRef = null; 
window.currentRoomId = null;
let activeCall = null; 
let pendingFiles = [];

/* --- CUSTOM DIALOG SYSTEM --- */
let dialogCallback = null;
function showCustomAlert(msg, icon='fa-info-circle') {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.style.display = 'flex';
    document.getElementById('dialog-icon').className = `fas ${icon}`;
    document.getElementById('dialog-msg').innerText = msg;
    document.getElementById('dialog-input').style.display = 'none';
    document.getElementById('dialog-cancel').style.display = 'none';
    document.getElementById('dialog-ok').innerText = "OK";
    dialogCallback = null;
}
function showCustomConfirm(msg, callback) {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.style.display = 'flex';
    document.getElementById('dialog-icon').className = 'fas fa-question-circle';
    document.getElementById('dialog-msg').innerText = msg;
    document.getElementById('dialog-input').style.display = 'none';
    document.getElementById('dialog-cancel').style.display = 'inline-block';
    document.getElementById('dialog-ok').innerText = "Yes";
    dialogCallback = (res) => { if(res) callback(); };
}
function showCustomPrompt(msg, callback) {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.style.display = 'flex';
    document.getElementById('dialog-icon').className = 'fas fa-pen';
    document.getElementById('dialog-msg').innerText = msg;
    const inp = document.getElementById('dialog-input');
    inp.style.display = 'block'; inp.value = ''; inp.focus();
    document.getElementById('dialog-cancel').style.display = 'inline-block';
    document.getElementById('dialog-ok').innerText = "Submit";
    dialogCallback = callback;
}
function closeCustomDialog(isOk) {
    const val = document.getElementById('dialog-input').value;
    document.getElementById('custom-dialog-overlay').style.display = 'none';
    if(dialogCallback) {
        if(isOk) dialogCallback(val || true);
        else dialogCallback(false);
    }
    dialogCallback = null;
}

/* --- UTILS --- */
function encryptData(data) { return CryptoJS.AES.encrypt(JSON.stringify(data), GLOBAL_NET_KEY).toString(); }
function decryptData(cipher) { try { return JSON.parse(CryptoJS.AES.decrypt(cipher, GLOBAL_NET_KEY).toString(CryptoJS.enc.Utf8)); } catch(e){return null;} }
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); reader.onerror = reject;
});

/* --- UI & AUTH --- */
function switchView(viewName, el) {
    if(el) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
    }
    ['feed', 'messages', 'timeline', 'notifications'].forEach(v => document.getElementById(`view-${v}`).style.display = 'none');
    document.getElementById(`view-${viewName}`).style.display = 'flex';
    if(viewName === 'feed') loadFeed();
    if(viewName === 'messages') renderFriendList();
    if(viewName === 'notifications') loadNotifications();
    
    // Hide Dropdown if open
    document.getElementById('user-dropdown').style.display = 'none';
}

auth.onAuthStateChanged(user => {
    const modal = document.getElementById('auth-modal');
    if (user) {
        currentUser = user.email.split('@')[0]; 
        modal.style.display = 'none';
        updateHeaderUser();
        loadFeed();
        listenForCalls();
    } else {
        modal.style.display = 'flex';
        modal.classList.add('animate-enter');
    }
    document.getElementById('login-loading').style.display = 'none';
});

async function updateHeaderUser() {
    // Load profile pic for header
    const snap = await db.ref(`users/${currentUser}/profilePic`).once('value');
    const pic = snap.val();
    const avatarEl = document.getElementById('header-avatar');
    document.getElementById('header-username').innerText = currentUser;
    
    if(pic) {
        avatarEl.style.backgroundImage = `url(${pic})`;
        avatarEl.innerText = '';
    } else {
        avatarEl.style.backgroundImage = 'none';
        avatarEl.innerText = currentUser[0].toUpperCase();
    }
}

async function handleLogin() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    document.getElementById('login-loading').style.display = 'block';
    try { await auth.signInWithEmailAndPassword(u + "@socialbook.com", p); } 
    catch (e) { showCustomAlert(e.message, "fa-times-circle"); document.getElementById('login-loading').style.display = 'none'; }
}
async function handleRegister() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    if(!u||!p) return showCustomAlert("Fill fields");
    try {
        await auth.createUserWithEmailAndPassword(u + "@socialbook.com", p);
        await db.ref('users/' + u).set({ friends: [] });
        showCustomAlert("Welcome!", "fa-check-circle");
    } catch(e) { showCustomAlert(e.message); }
}
function handleSignOut() {
    showCustomConfirm("Are you sure you want to sign out?", () => {
        auth.signOut();
        window.location.reload();
    });
}

/* --- POSTS & COMMENTS --- */
function handleFileSelect(input) {
    const preview = document.getElementById('upload-preview');
    preview.innerHTML = '';
    pendingFiles = Array.from(input.files);
    pendingFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            const isVid = file.type.startsWith('video');
            const el = isVid ? document.createElement('video') : document.createElement('img');
            el.src = e.target.result; el.className = 'post-media';
            if(isVid) el.controls = true;
            preview.appendChild(el);
        };
        reader.readAsDataURL(file);
    });
}
async function createPost() {
    const txt = document.getElementById('post-input').value;
    const privacy = document.getElementById('post-privacy').value;
    const isLive = document.getElementById('post-livestream').checked;
    if(!txt && pendingFiles.length === 0 && !isLive) return;

    const progress = document.getElementById('upload-progress');
    const bar = document.getElementById('upload-bar');
    progress.style.display = 'block';
    let width = 0;
    const interval = setInterval(() => { if(width<90) { width+=10; bar.style.width = width+'%'; } }, 200);

    const mediaList = [];
    for (let file of pendingFiles) {
        const b64 = await toBase64(file);
        mediaList.push({ type: file.type.startsWith('video')?'video':'image', src: b64 });
    }
    clearInterval(interval); bar.style.width = '100%';

    const postRef = db.ref('posts').push();
    const data = { 
        author: currentUser, content: txt, media: mediaList, date: new Date().toLocaleString(),
        likes: [], comments: [], privacy: privacy, isLive: isLive, streamStatus: isLive ? 'active' : 'off'
    };
    await postRef.set(encryptData(data));
    
    setTimeout(() => { progress.style.display = 'none'; bar.style.width = '0%'; }, 500);
    document.getElementById('post-input').value = '';
    document.getElementById('upload-preview').innerHTML = '';
    document.getElementById('post-files').value = '';
    pendingFiles = [];
    document.getElementById('post-livestream').checked = false;

    if(isLive) startLiveBroadcast(postRef.key);
}

function loadFeed(filterUser=null) {
    const container = filterUser ? document.getElementById('timeline-stream') : document.getElementById('feed-stream');
    db.ref('posts').on('value', async (snap) => {
        const userSnap = await db.ref('users/' + currentUser).once('value');
        const friends = (userSnap.val() && userSnap.val().friends) || [];
        container.innerHTML = '';
        const posts = [];
        snap.forEach(c => {
            const p = decryptData(c.val());
            if(p) {
                p.key = c.key;
                let show = p.author === currentUser || p.privacy === 'public';
                if(p.privacy === 'friends' && friends.includes(p.author)) show = true;
                if(show) posts.push(p);
            }
        });
        posts.reverse().forEach(p => {
            if(filterUser && p.author !== filterUser) return;
            renderPost(p, container);
        });
    });
}
function renderPost(p, container) {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    const isMine = p.author === currentUser;
    const isLive = p.isLive && p.streamStatus === 'active';
    let mediaHtml = '';
    if(p.media && p.media.length > 0) {
        const gridClass = p.media.length > 1 ? 'multi' : 'single';
        mediaHtml = `<div class="media-grid ${gridClass}">`;
        p.media.forEach(m => {
            mediaHtml += m.type === 'video' ? `<video src="${m.src}" class="post-media" controls></video>` : `<img src="${m.src}" class="post-media">`;
        });
        mediaHtml += '</div>';
    }
    // Comments HTML
    const commentsHtml = (p.comments || []).map(c => `<div class="comment"><b>${c.author}:</b> ${c.text}</div>`).join('');

    div.innerHTML = `
        <div class="post-header">
            <div class="post-user-info">
                <div class="avatar" onclick="openTimeline('${p.author}')" style="background-image:url(${p.userPic||''})">${!p.userPic?p.author[0]:''}</div>
                <div>
                    <div class="username" onclick="openTimeline('${p.author}')">${p.author} ${isLive ? '<span style="color:red; margin-left:5px;">LIVE 🔴</span>' : ''}</div>
                    <div class="timestamp">${p.date}</div>
                </div>
            </div>
            ${isMine ? `<button class="btn-icon" onclick="deletePost('${p.key}')" style="color:#ef4444;"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div style="line-height:1.5;">${p.content}</div>
        ${mediaHtml}
        <div class="post-actions">
            <div class="action-btn" onclick="toggleLike('${p.key}')"><i class="far fa-heart"></i> ${p.likes ? p.likes.length : 0}</div>
            <div class="action-btn" onclick="toggleCommentSection('${p.key}')"><i class="far fa-comment"></i> ${p.comments ? p.comments.length : 0}</div>
            ${isLive ? `<div class="action-btn" style="color:red;" onclick="joinLiveStream('${p.key}')"><i class="fas fa-tv"></i> Watch</div>` : ''}
        </div>
        <div id="comments-${p.key}" class="comments-section">
            <div class="comments-list">${commentsHtml}</div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <input class="input-modern" placeholder="Comment..." style="margin:0;">
                <button class="btn-modern" onclick="addComment('${p.key}', this)">Send</button>
            </div>
        </div>
    `;
    container.appendChild(div);
}
function toggleCommentSection(key) {
    const el = document.getElementById(`comments-${key}`);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
function deletePost(key) { showCustomConfirm("Delete post?", () => db.ref('posts/' + key).remove()); }
function toggleLike(key) {
    db.ref('posts/'+key).transaction(raw => {
        if(!raw) return raw;
        let p = decryptData(raw);
        if(!p.likes) p.likes = [];
        if(p.likes.includes(currentUser)) p.likes = p.likes.filter(x=>x!==currentUser);
        else p.likes.push(currentUser);
        return encryptData(p);
    });
}
function addComment(key, btn) {
    const val = btn.previousElementSibling.value;
    if(!val) return;
    db.ref('posts/'+key).transaction(raw => {
        let p = decryptData(raw);
        if(!p.comments) p.comments = [];
        p.comments.push({author:currentUser, text:val});
        return encryptData(p);
    });
}

/* --- CHAT WITH FIXED DELETE --- */
function createGroupChat() {
    showCustomPrompt("Group Name:", name => {
        const gid = 'group_' + Date.now();
        db.ref(`users/${currentUser}/groups/${gid}`).set({name: name, type:'group'});
    });
}
function renderFriendList() {
    const list = document.getElementById('msg-friend-list');
    db.ref(`users/${currentUser}/friends`).on('value', fSnap => {
        const friends = fSnap.val() || [];
        db.ref(`users/${currentUser}/groups`).on('value', gSnap => {
            const groups = gSnap.val() || {};
            let html = '<div style="padding:10px; opacity:0.5; font-weight:bold; display:flex; justify-content:space-between;"><span>CHATS</span><i class="fas fa-plus" onclick="createGroupChat()"></i></div>';
            Object.keys(groups).forEach(gid => {
                html += `<div class="friend-item" onclick="selectChat('${gid}', '${groups[gid].name}', true)"><div style="width:30px;height:30px;background:var(--accent-gradient);border-radius:50%;"></div> ${groups[gid].name}</div>`;
            });
            friends.forEach(f => {
                html += `<div class="friend-item" onclick="selectChat('${f}', '${f}', false)"><div style="width:30px;height:30px;background:#ddd;border-radius:50%;display:flex;align-items:center;justify-content:center;">${f[0]}</div> ${f}</div>`;
            });
            list.innerHTML = html;
        });
    });
}
function selectChat(id, name, isGroup) {
    currentChatPartner = id; currentChatIsGroup = isGroup;
    window.currentRoomId = isGroup ? id : [currentUser, id].sort().join('_');
    document.getElementById('chat-with-name').innerText = name;
    document.getElementById('chat-window').innerHTML = '';
    
    if(chatListenerRef) chatListenerRef.off();
    chatListenerRef = db.ref('chats/' + window.currentRoomId);
    
    chatListenerRef.on('child_added', s => {
        const m = decryptData(s.val());
        if(!m) return;
        const isMe = m.author === currentUser;
        
        // Use Flex Row to position bubbles
        const row = document.createElement('div');
        row.className = `msg-row ${isMe ? 'mine' : 'theirs'}`;
        row.id = `msg-row-${s.key}`;

        const bubble = document.createElement('div');
        bubble.className = `msg-bubble ${isMe ? 'mine' : 'theirs'}`;
        bubble.innerHTML = `${isGroup && !isMe ? `<div style="font-size:0.7rem;opacity:0.7;">${m.author}</div>` : ''}
            ${m.text} ${m.image ? `<br><img src="${m.image}" style="max-width:200px;border-radius:10px;margin-top:5px;">` : ''}`;
        
        // Delete button next to bubble
        const delBtn = isMe ? document.createElement('i') : null;
        if(delBtn) {
            delBtn.className = "fas fa-trash";
            delBtn.style.cssText = "color:#ef4444; cursor:pointer; font-size:0.8rem; opacity:0.7; padding: 5px;";
            delBtn.onclick = () => deleteMessage(s.key);
            // Append order: Delete Btn then Bubble for "Mine" (Flex-end reverses visually if we want, but explicit order is safer)
            row.appendChild(delBtn);
            row.appendChild(bubble);
        } else {
            row.appendChild(bubble);
        }

        document.getElementById('chat-window').appendChild(row);
    });
    
    chatListenerRef.on('child_removed', s => {
        const el = document.getElementById(`msg-row-${s.key}`);
        if(el) el.remove();
    });
}
function sendMessage() {
    const inp = document.getElementById('msg-input');
    if(!inp.value) return;
    const data = { author: currentUser, text: inp.value, date: Date.now() };
    db.ref('chats/' + window.currentRoomId).push(encryptData(data));
    inp.value = '';
}
function deleteMessage(key) {
    showCustomConfirm("Unsend message?", () => {
        db.ref('chats/' + window.currentRoomId + '/' + key).remove();
    });
}

/* --- TIMELINE PROFILE & COVER --- */
async function openTimeline(username) {
    viewedProfile = username;
    switchView('timeline');
    document.getElementById('profile-username').innerText = username;
    
    // Fetch user data
    const snap = await db.ref('users/' + username).once('value');
    const uData = snap.val() || {};
    
    const coverEl = document.getElementById('profile-cover-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    const initialEl = document.getElementById('profile-initial');
    const avatarBtn = document.getElementById('avatar-upload-btn');
    const coverBtn = document.getElementById('cover-upload-btn');
    
    // Setup Cover
    if(uData.coverPic) coverEl.style.backgroundImage = `url(${uData.coverPic})`;
    else coverEl.style.backgroundImage = 'none';

    // Setup Avatar
    if(uData.profilePic) {
        avatarEl.style.backgroundImage = `url(${uData.profilePic})`;
        initialEl.style.display = 'none';
    } else {
        avatarEl.style.backgroundImage = 'none';
        initialEl.style.display = 'block';
        initialEl.innerText = username[0].toUpperCase();
    }

    // Show upload buttons only if my profile
    if(username === currentUser) {
        avatarBtn.style.display = 'flex';
        coverBtn.style.display = 'flex';
    } else {
        avatarBtn.style.display = 'none';
        coverBtn.style.display = 'none';
    }
    
    // Hide dropdown
    document.getElementById('user-dropdown').style.display = 'none';
    loadFeed(username);
}

async function updateProfilePic(input) {
    if(input.files[0]) {
        const b64 = await toBase64(input.files[0]);
        await db.ref(`users/${currentUser}/profilePic`).set(b64);
        openTimeline(currentUser);
        updateHeaderUser();
    }
}

async function updateCoverPhoto(input) {
    if(input.files[0]) {
        const b64 = await toBase64(input.files[0]);
        await db.ref(`users/${currentUser}/coverPic`).set(b64);
        openTimeline(currentUser);
    }
}

/* --- FIXED WEB-RTC CALLS --- */
let localStream, pc;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function initiateCall(type) {
    if(!currentChatPartner) return showCustomAlert("Select a chat first");
    const callId = window.currentRoomId;
    db.ref(`calls/${callId}`).set({ caller: currentUser, type: type, status: 'ringing', timestamp: Date.now() });
    activeCall = { id: callId, type: type, role: 'host' };
    openVideoModal('calling', type);
    
    db.ref(`calls/${callId}/status`).on('value', s => {
        if(s.val() === 'accepted') startWebRTC(true);
        if(s.val() === 'rejected') endCallAction();
    });
}

function listenForCalls() {
    db.ref('calls').on('child_added', snap => {
        const val = snap.val();
        if(!val || val.status !== 'ringing' || val.caller === currentUser) return;
        if(snap.key.includes(currentUser)) {
            showCustomConfirm(`${val.caller} is calling (${val.type}). Answer?`, () => {
                // Set activeCall explicitly BEFORE accepting
                activeCall = { id: snap.key, type: val.type, role: 'guest' };
                db.ref(`calls/${snap.key}`).update({ status: 'accepted' });
                openVideoModal('answer', val.type);
                startWebRTC(false);
            });
        }
    });
}

async function startWebRTC(isOfferer) {
    // Safety check
    if(!activeCall) return console.error("No active call found");
    const { id, type } = activeCall;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: type==='video', audio: true });
        document.getElementById('localVideo').srcObject = localStream;
    } catch(e) { console.log(e); }

    pc = new RTCPeerConnection(rtcConfig);
    if(localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    
    pc.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    
    pc.onicecandidate = e => {
        if(e.candidate) db.ref(`calls/${id}/${isOfferer?'offer_ice':'answer_ice'}`).push(JSON.stringify(e.candidate));
    };

    if(isOfferer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        db.ref(`calls/${id}/offer`).set(JSON.stringify(offer));
        db.ref(`calls/${id}/answer`).on('value', async s => {
            if(s.val() && !pc.currentRemoteDescription) await pc.setRemoteDescription(JSON.parse(s.val()));
        });
    } else {
        const offerSnap = await db.ref(`calls/${id}/offer`).once('value');
        if(offerSnap.exists()){
            await pc.setRemoteDescription(JSON.parse(offerSnap.val()));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            db.ref(`calls/${id}/answer`).set(JSON.stringify(answer));
        }
    }
    
    db.ref(`calls/${id}/${!isOfferer?'offer_ice':'answer_ice'}`).on('child_added', s => {
        if(pc.remoteDescription) pc.addIceCandidate(JSON.parse(s.val()));
    });
}

function openVideoModal(mode, type) {
    document.getElementById('video-modal').style.display = 'flex';
    document.getElementById('call-type-label').innerText = type === 'video' ? 'Video Call' : 'Audio Call';
    if(type === 'audio') document.getElementById('localVideo').style.display = 'none';
    else document.getElementById('localVideo').style.display = 'block';
}

function endCallAction() {
    if(activeCall) db.ref(`calls/${activeCall.id}`).remove();
    document.getElementById('video-modal').style.display = 'none';
    if(localStream) localStream.getTracks().forEach(t => t.stop());
    if(pc) pc.close();
    activeCall = null;
}
