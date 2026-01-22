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

/* --- HELPER FUNCTIONS --- */
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

function encryptData(data) { return CryptoJS.AES.encrypt(JSON.stringify(data), GLOBAL_NET_KEY).toString(); }
function decryptData(cipher) { try { return JSON.parse(CryptoJS.AES.decrypt(cipher, GLOBAL_NET_KEY).toString(CryptoJS.enc.Utf8)); } catch(e){return null;} }
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); reader.onerror = reject;
});

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

/* --- POSTS --- */
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
    
    // Check if current user has liked this post (FIXED HEART HIGHLIGHT)
    const hasLiked = p.likes && p.likes.includes(currentUser);
    const heartIcon = hasLiked ? 'fas fa-heart' : 'far fa-heart';
    const heartClass = hasLiked ? 'like-btn liked' : 'like-btn';
    
    let mediaHtml = '';
    if(p.media && p.media.length > 0) {
        const gridClass = p.media.length > 1 ? 'multi' : 'single';
        mediaHtml = `<div class="media-grid ${gridClass}">`;
        p.media.forEach(m => {
            mediaHtml += m.type === 'video' ? `<video src="${m.src}" class="post-media" controls></video>` : `<img src="${m.src}" class="post-media">`;
        });
        mediaHtml += '</div>';
    }
    const commentsHtml = (p.comments || []).map(c => `<div class="comment"><b>${c.author}:</b> ${c.text}</div>`).join('');

    // Logic: If live AND mine, show "You are live" (No watch button)
    // If live AND NOT mine, show "Watch" button
    let liveAction = '';
    if(isLive) {
        if(isMine) liveAction = `<span style="color:red; font-weight:bold; margin-left: auto;">🔴 You are Live</span>`;
        else liveAction = `<div class="action-btn" style="color:red;" onclick="joinLiveStream('${p.key}')"><i class="fas fa-tv"></i> Watch</div>`;
    }

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
            <div class="action-btn ${heartClass}" onclick="toggleLike('${p.key}')" style="${hasLiked ? 'color: #ef4444;' : ''}">
                <i class="${heartIcon}" style="${hasLiked ? 'color: #ef4444;' : ''}"></i> ${p.likes ? p.likes.length : 0}
            </div>
            <div class="action-btn" onclick="toggleCommentSection('${p.key}')"><i class="far fa-comment"></i> ${p.comments ? p.comments.length : 0}</div>
            ${liveAction}
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

/* --- CHAT --- */
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
        
        const row = document.createElement('div');
        row.className = `msg-row ${isMe ? 'mine' : 'theirs'}`;
        row.id = `msg-row-${s.key}`;

        const bubble = document.createElement('div');
        bubble.className = `msg-bubble ${isMe ? 'mine' : 'theirs'}`;
        bubble.innerHTML = `${isGroup && !isMe ? `<div style="font-size:0.7rem;opacity:0.7;">${m.author}</div>` : ''}
            ${m.text} ${m.image ? `<br><img src="${m.image}" style="max-width:200px;border-radius:10px;margin-top:5px;">` : ''}`;
        
        if(isMe) {
            const delBtn = document.createElement('i');
            delBtn.className = "fas fa-trash";
            delBtn.style.cssText = "color:#ef4444; cursor:pointer; font-size:0.8rem; opacity:0.7; padding: 5px;";
            delBtn.onclick = () => deleteMessage(s.key);
            row.appendChild(delBtn);
        }
        row.appendChild(bubble);
        document.getElementById('chat-window').appendChild(row);
    });
    
    chatListenerRef.on('child_removed', s => {
        const el = document.getElementById(`msg-row-${s.key}`);
        if(el) el.remove();
    });
}
async function handleMessageImage(input) {
    if(input.files[0]) {
        const file = input.files[0];
        const b64 = await toBase64(file);
        const data = { 
            author: currentUser, 
            text: "", 
            image: b64, 
            date: Date.now() 
        };
        db.ref('chats/' + window.currentRoomId).push(encryptData(data));
        input.value = '';
    }
}
function sendMessage() {
    const inp = document.getElementById('msg-input');
    const text = inp.value.trim();
    if(!text) return;
    const data = { author: currentUser, text: text, date: Date.now() };
    db.ref('chats/' + window.currentRoomId).push(encryptData(data));
    inp.value = '';
}
function deleteMessage(key) {
    showCustomConfirm("Unsend message?", () => {
        db.ref('chats/' + window.currentRoomId + '/' + key).remove();
    });
}
function addEmoji(emoji) {
    const inp = document.getElementById('msg-input');
    inp.value += emoji;
    document.getElementById('emoji-picker').style.display = 'none';
}

/* --- TIMELINE --- */
async function openTimeline(username) {
    viewedProfile = username;
    switchView('timeline');
    document.getElementById('profile-username').innerText = username;
    
    const snap = await db.ref('users/' + username).once('value');
    const uData = snap.val() || {};
    
    const coverEl = document.getElementById('profile-cover-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    const initialEl = document.getElementById('profile-initial');
    const avatarBtn = document.getElementById('avatar-upload-btn');
    const coverBtn = document.getElementById('cover-upload-btn');
    
    if(uData.coverPic) coverEl.style.backgroundImage = `url(${uData.coverPic})`;
    else coverEl.style.backgroundImage = 'none';

    if(uData.profilePic) {
        avatarEl.style.backgroundImage = `url(${uData.profilePic})`;
        initialEl.style.display = 'none';
    } else {
        avatarEl.style.backgroundImage = 'none';
        initialEl.style.display = 'block';
        initialEl.innerText = username[0].toUpperCase();
    }

    if(username === currentUser) {
        avatarBtn.style.display = 'flex';
        coverBtn.style.display = 'flex';
    } else {
        avatarBtn.style.display = 'none';
        coverBtn.style.display = 'none';
    }
    
    // Check friendship status for buttons
    const currentUserSnap = await db.ref('users/' + currentUser).once('value');
    const currentUserData = currentUserSnap.val() || {};
    const isFriend = (currentUserData.friends || []).includes(username);
    const isMe = username === currentUser;
    
    const addFriendBtn = document.getElementById('btn-add-friend');
    const msgFriendBtn = document.getElementById('btn-msg-friend');
    
    if (isMe) {
        addFriendBtn.style.display = 'none';
        msgFriendBtn.style.display = 'none';
    } else if (isFriend) {
        addFriendBtn.style.display = 'none';
        msgFriendBtn.style.display = 'block';
    } else {
        addFriendBtn.style.display = 'block';
        msgFriendBtn.style.display = 'none';
    }
    
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

/* --- COMPLETELY FIXED WEBRTC CALLING SYSTEM --- */
let localStream = null;
let pc = null;
const rtcConfig = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ] 
};
let candidateQueue = [];
let answerListener = null;
let offerListener = null;
let iceAnswerListener = null;
let iceOfferListener = null;

function initiateCall(type) {
    if(!currentChatPartner) return showCustomAlert("Select a chat first");
    
    // Generate call ID
    let callId;
    if (currentChatIsGroup) {
        callId = currentChatPartner;
    } else {
        callId = [currentUser, currentChatPartner].sort().join('_');
    }
    
    // Clean up any existing call data
    db.ref(`calls/${callId}`).remove();
    
    activeCall = { 
        id: callId, 
        type: type, 
        role: 'host',
        chatPartner: currentChatPartner,
        isGroup: currentChatIsGroup
    };
    
    // Set up the call with a timeout
    db.ref(`calls/${callId}`).set({ 
        caller: currentUser, 
        type: type, 
        status: 'ringing', 
        timestamp: Date.now(),
        participants: currentChatIsGroup ? 'group' : [currentUser, currentChatPartner],
        isGroup: currentChatIsGroup
    });
    
    openVideoModal('calling', type);
    
    // Listen for answer with a timeout
    const timeout = setTimeout(() => {
        if (activeCall && activeCall.status !== 'accepted') {
            showCustomAlert("No answer. Call ended.", "fa-times-circle");
            endCallAction();
        }
    }, 30000); // 30 second timeout
    
    db.ref(`calls/${callId}/status`).on('value', s => {
        if(!s.val()) return;
        
        if(s.val() === 'accepted') {
            clearTimeout(timeout);
            activeCall.status = 'accepted';
            startWebRTC(true);
        } else if(s.val() === 'rejected') {
            clearTimeout(timeout);
            showCustomAlert("Call rejected", "fa-times-circle");
            endCallAction();
        } else if(s.val() === 'ended') {
            clearTimeout(timeout);
            showCustomAlert("Call ended", "fa-times-circle");
            endCallAction();
        }
    });
}

function listenForCalls() {
    db.ref('calls').on('child_added', async snap => {
        const val = snap.val();
        if(!val || val.status !== 'ringing' || val.caller === currentUser) return;
        
        // Check if this call is for me
        let shouldAnswer = false;
        
        if (val.isGroup) {
            const groupSnap = await db.ref(`users/${currentUser}/groups/${snap.key}`).once('value');
            shouldAnswer = groupSnap.exists();
        } else {
            shouldAnswer = val.participants && val.participants.includes(currentUser);
        }
        
        if (shouldAnswer) {
            showCustomConfirm(`${val.caller} is calling (${val.type}). Answer?`, () => {
                activeCall = { 
                    id: snap.key, 
                    type: val.type, 
                    role: 'guest',
                    status: 'accepted',
                    isGroup: val.isGroup
                };
                
                // Update call status to accepted
                db.ref(`calls/${snap.key}`).update({ status: 'accepted' });
                openVideoModal('answer', val.type);
                startWebRTC(false);
            }, () => {
                // User rejected the call
                db.ref(`calls/${snap.key}`).update({ status: 'rejected' });
            });
        }
    });
}

// LIVE STREAM FUNCTIONS
function startLiveBroadcast(postId) {
    activeCall = { id: postId, type: 'live', role: 'host' };
    openVideoModal('live', 'video');
    startWebRTC(true, true);
}

function joinLiveStream(postId) {
    activeCall = { id: postId, type: 'live', role: 'guest' };
    openVideoModal('watch', 'video');
    startWebRTC(false, true);
}

async function startWebRTC(isOfferer, isLive=false) {
    if(!activeCall) return;
    
    const callId = activeCall.id;
    const type = activeCall.type;
    const basePath = isLive ? `livestreams/${callId}` : `calls/${callId}`;
    
    try {
        // Clean up any existing listeners
        cleanupWebRTCListeners();
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: type === 'video' || type === 'live', 
            audio: true 
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('video-status').innerText = isOfferer ? 'Calling...' : 'Connecting...';
        
        // Create new peer connection
        pc = new RTCPeerConnection(rtcConfig);
        
        // Add local tracks
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
        
        // Handle incoming remote stream
        pc.ontrack = (event) => {
            console.log("Received remote track");
            if (event.streams && event.streams[0]) {
                document.getElementById('remoteVideo').srcObject = event.streams[0];
                document.getElementById('video-status').innerText = 'Connected';
            }
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const candidatePath = isOfferer ? `${basePath}/offerCandidates` : `${basePath}/answerCandidates`;
                db.ref(candidatePath).push(JSON.stringify(event.candidate.toJSON()));
            }
        };
        
        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log("Connection state:", pc.connectionState);
            if (pc.connectionState === 'connected') {
                document.getElementById('video-status').innerText = 'Connected';
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                showCustomAlert("Call failed to connect", "fa-times-circle");
                endCallAction();
            }
        };
        
        // Handle ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log("ICE connection state:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                showCustomAlert("Connection failed", "fa-times-circle");
                endCallAction();
            }
        };
        
        if (isOfferer) {
            // Create offer
            const offerDescription = await pc.createOffer();
            await pc.setLocalDescription(offerDescription);
            
            // Send offer to Firebase
            await db.ref(`${basePath}/offer`).set(JSON.stringify(offerDescription));
            
            // Listen for answer
            answerListener = db.ref(`${basePath}/answer`).on('value', async (snapshot) => {
                if (!snapshot.exists() || !pc.currentRemoteDescription) {
                    const answerDescription = snapshot.val();
                    if (answerDescription) {
                        try {
                            await pc.setRemoteDescription(JSON.parse(answerDescription));
                        } catch (error) {
                            console.error("Error setting remote description:", error);
                        }
                    }
                }
            });
            
            // Listen for answer ICE candidates
            iceAnswerListener = db.ref(`${basePath}/answerCandidates`).on('child_added', async (snapshot) => {
                const candidate = JSON.parse(snapshot.val());
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            });
            
        } else {
            // Listen for offer
            offerListener = db.ref(`${basePath}/offer`).on('value', async (snapshot) => {
                if (snapshot.exists() && !pc.currentRemoteDescription) {
                    const offerDescription = snapshot.val();
                    if (offerDescription) {
                        try {
                            await pc.setRemoteDescription(JSON.parse(offerDescription));
                            
                            // Create answer
                            const answerDescription = await pc.createAnswer();
                            await pc.setLocalDescription(answerDescription);
                            
                            // Send answer to Firebase
                            await db.ref(`${basePath}/answer`).set(JSON.stringify(answerDescription));
                        } catch (error) {
                            console.error("Error setting remote description:", error);
                        }
                    }
                }
            });
            
            // Listen for offer ICE candidates
            iceOfferListener = db.ref(`${basePath}/offerCandidates`).on('child_added', async (snapshot) => {
                const candidate = JSON.parse(snapshot.val());
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            });
        }
        
        // Listen for remote ICE candidates from the other side
        const remoteCandidatePath = isOfferer ? `${basePath}/answerCandidates` : `${basePath}/offerCandidates`;
        const remoteCandidateListener = db.ref(remoteCandidatePath).on('child_added', async (snapshot) => {
            const candidate = JSON.parse(snapshot.val());
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("Error adding remote ICE candidate:", error);
            }
        });
        
    } catch (error) {
        console.error("WebRTC error:", error);
        showCustomAlert("Failed to start call: " + error.message, "fa-times-circle");
        endCallAction();
    }
}

function cleanupWebRTCListeners() {
    // Remove all Firebase listeners
    if (answerListener) {
        answerListener.off();
        answerListener = null;
    }
    if (offerListener) {
        offerListener.off();
        offerListener = null;
    }
    if (iceAnswerListener) {
        iceAnswerListener.off();
        iceAnswerListener = null;
    }
    if (iceOfferListener) {
        iceOfferListener.off();
        iceOfferListener = null;
    }
    
    // Clear candidate queue
    candidateQueue = [];
}

function openVideoModal(mode, type) {
    document.getElementById('video-modal').style.display = 'flex';
    document.getElementById('call-type-label').innerText = type === 'live' ? 'Live Stream' : (type === 'video' ? 'Video Call' : 'Audio Call');
    
    // Reset video elements
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('localVideo').srcObject = null;
    
    // Set status message
    let statusMsg = '';
    switch(mode) {
        case 'calling': statusMsg = 'Calling...'; break;
        case 'answer': statusMsg = 'Connecting...'; break;
        case 'live': statusMsg = 'Starting live stream...'; break;
        case 'watch': statusMsg = 'Joining live stream...'; break;
        default: statusMsg = 'Connecting...';
    }
    document.getElementById('video-status').innerText = statusMsg;
    
    // Show/hide local video based on call type
    if(type === 'audio' || (activeCall && activeCall.type === 'live' && activeCall.role === 'guest')) {
        document.getElementById('localVideo').style.display = 'none';
    } else {
        document.getElementById('localVideo').style.display = 'block';
    }
}

function endCallAction() {
    // Clean up WebRTC
    cleanupWebRTCListeners();
    
    // Stop media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    
    // Close peer connection
    if (pc) {
        pc.close();
        pc = null;
    }
    
    // Update call status in Firebase if we have an active call
    if (activeCall) {
        const basePath = activeCall.type === 'live' ? `livestreams/${activeCall.id}` : `calls/${activeCall.id}`;
        
        // Only host should remove the call data
        if (activeCall.role === 'host') {
            db.ref(basePath).remove();
        } else {
            // Guest just sets status to ended
            db.ref(`${basePath}/status`).set('ended');
        }
        
        // Update live stream status if needed
        if (activeCall.type === 'live' && activeCall.role === 'host') {
            db.ref(`posts/${activeCall.id}`).update({streamStatus: 'ended'});
        }
    }
    
    // Hide video modal
    document.getElementById('video-modal').style.display = 'none';
    
    // Reset active call
    activeCall = null;
    
    // Reset video elements
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('localVideo').srcObject = null;
}

/* --- CONTROLS --- */
function toggleCam() {
    if(localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if(videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            document.getElementById('btn-cam').classList.toggle('active');
        }
    }
}

function toggleMic() {
    if(localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if(audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            document.getElementById('btn-mic').classList.toggle('active');
        }
    }
}

/* --- FRIEND ACTIONS --- */
async function addFriendAction() {
    if (!viewedProfile || viewedProfile === currentUser) return;
    
    // Add to current user's friend list
    const currentUserRef = db.ref(`users/${currentUser}/friends`);
    const currentSnap = await currentUserRef.once('value');
    const currentFriends = currentSnap.val() || [];
    
    if (!currentFriends.includes(viewedProfile)) {
        currentFriends.push(viewedProfile);
        await currentUserRef.set(currentFriends);
        showCustomAlert(`Added ${viewedProfile} as friend!`, 'fa-check-circle');
        openTimeline(viewedProfile);
    }
}

function messageFriendAction() {
    if (!viewedProfile || viewedProfile === currentUser) return;
    switchView('messages');
    selectChat(viewedProfile, viewedProfile, false);
}

/* --- NOTIFICATIONS --- */
function loadNotifications() {
    const container = document.getElementById('notif-list');
    container.innerHTML = '<div class="notif-item"><i class="fas fa-info-circle"></i> No notifications yet</div>';
}

/* --- INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', () => {
    // Set up message image upload
    document.getElementById('msg-image').addEventListener('change', function(e) {
        handleMessageImage(this);
    });
    
    // Allow pressing Enter to send messages
    document.getElementById('msg-input').addEventListener('keypress', function(e) {
        if(e.key === 'Enter') {
            sendMessage();
        }
    });
});
