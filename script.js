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

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentChatPartner = null;
let currentChatIsGroup = false;
let viewedProfile = null;
const GLOBAL_NET_KEY = "SocialBook_Universal_Link_2026";
let chatListenerRef = null; 
window.currentRoomId = null; // Global variable for active room

/* --- CUSTOM DIALOG SYSTEM --- */
let dialogCallback = null;

function showCustomAlert(msg, icon='fa-info-circle') {
    document.getElementById('custom-dialog-overlay').style.display = 'flex';
    document.getElementById('dialog-icon').className = `fas ${icon}`;
    document.getElementById('dialog-msg').innerText = msg;
    document.getElementById('dialog-input').style.display = 'none';
    document.getElementById('dialog-cancel').style.display = 'none';
    document.getElementById('dialog-ok').innerText = "OK";
    dialogCallback = null;
}

function showCustomPrompt(msg, callback) {
    document.getElementById('custom-dialog-overlay').style.display = 'flex';
    document.getElementById('dialog-icon').className = 'fas fa-pen';
    document.getElementById('dialog-msg').innerText = msg;
    const inp = document.getElementById('dialog-input');
    inp.style.display = 'block';
    inp.value = '';
    inp.focus();
    document.getElementById('dialog-cancel').style.display = 'block';
    document.getElementById('dialog-ok').innerText = "Submit";
    dialogCallback = callback;
}

function closeCustomDialog(isOk) {
    const val = document.getElementById('dialog-input').value;
    document.getElementById('custom-dialog-overlay').style.display = 'none';
    if(dialogCallback) {
        if(isOk && val) dialogCallback(val);
        dialogCallback = null;
    }
}

/* --- UTILS --- */
function encryptData(data) { return CryptoJS.AES.encrypt(JSON.stringify(data), GLOBAL_NET_KEY).toString(); }
function decryptData(cipher) { try { return JSON.parse(CryptoJS.AES.decrypt(cipher, GLOBAL_NET_KEY).toString(CryptoJS.enc.Utf8)); } catch(e){return null;} }
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
    if(viewName === 'messages') renderFriendList();
}

/* --- AUTH (PERMANENT) --- */
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user.email.split('@')[0]; 
        document.getElementById('auth-modal').style.display = 'none';
        document.querySelector('.user-status').innerText = currentUser;
        loadFeed();
        document.getElementById('login-loading').style.display = 'none';
    } else {
        document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('login-loading').style.display = 'none';
    }
});

async function handleRegister() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    if(!u || !p) return showCustomAlert("Fill fields", "fa-exclamation-triangle");

    const fakeEmail = u + "@socialbook.com";

    try {
        await auth.createUserWithEmailAndPassword(fakeEmail, p);
        await db.ref('users/' + u).set({ friends: [] });
        showCustomAlert("Account Created!", "fa-check-circle");
    } catch (error) {
        showCustomAlert("Error: " + error.message, "fa-times-circle");
    }
}

async function handleLogin() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value;
    const loading = document.getElementById('login-loading');
    loading.style.display = 'block';

    const fakeEmail = u + "@socialbook.com";
    
    try {
        await auth.signInWithEmailAndPassword(fakeEmail, p);
    } catch (error) {
        showCustomAlert("Login Failed: " + error.message, "fa-times-circle");
        loading.style.display = 'none';
    }
}

/* --- POSTS (REALTIME FEED) --- */
async function createPost() {
    if(!currentUser) return;
    const txt = document.getElementById('post-input').value;
    const fileInput = document.getElementById('post-image');
    
    // Privacy and Live logic
    const privacy = document.getElementById('post-privacy').value;
    const isLive = document.getElementById('post-livestream').checked;

    if(!txt && !fileInput.files[0] && !isLive) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const data = { 
        author: currentUser, 
        content: txt, 
        image: imgData, 
        date: new Date().toLocaleString(),
        likes: [], 
        comments: [],
        privacy: privacy,
        isLive: isLive
    };

    const encrypted = encryptData(data);
    db.ref('posts').push(encrypted);

    document.getElementById('post-input').value = '';
    fileInput.value = '';
    document.getElementById('post-livestream').checked = false;
}

function loadFeed(filterUser = null) {
    const container = filterUser ? document.getElementById('timeline-stream') : document.getElementById('feed-stream');
    
    db.ref('posts').on('value', async (snapshot) => {
        container.innerHTML = ''; 
        const posts = [];

        // Fetch user friends to check privacy
        const userSnap = await db.ref('users/' + currentUser).once('value');
        const myFriends = (userSnap.val() && userSnap.val().friends) ? userSnap.val().friends : [];

        snapshot.forEach(childSnapshot => {
            const post = decryptData(childSnapshot.val());
            if(post) {
                post.key = childSnapshot.key;
                
                // Privacy Filter Logic
                let allow = false;
                if(post.author === currentUser) allow = true;
                else if(!post.privacy || post.privacy === 'public') allow = true;
                else if(post.privacy === 'friends' && myFriends.includes(post.author)) allow = true;
                
                if(allow) posts.push(post);
            }
        });

        posts.reverse().forEach(post => {
            if (filterUser && post.author !== filterUser) return;
            renderPost(post, container);
        });
    });
}

function renderPost(post, container) {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    const isLiked = post.likes && post.likes.includes(currentUser);
    
    const privacyIcon = post.privacy === 'private' ? '🔒' : post.privacy === 'friends' ? '👥' : '🌎';
    const liveTag = post.isLive ? `<span style="background:red; color:white; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:bold; margin-left:10px;">LIVE</span>` : '';

    div.innerHTML = `
        <div class="post-header">
            <div class="avatar" onclick="openTimeline('${post.author}')">${post.author[0].toUpperCase()}</div>
            <div>
                <div class="username" onclick="openTimeline('${post.author}')">
                    ${post.author} ${liveTag} 
                    <span style="font-size:0.7rem; color:#aaa; font-weight:normal; margin-left:5px;">${privacyIcon}</span>
                </div>
                <div class="timestamp">${post.date}</div>
            </div>
        </div>
        <div style="line-height: 1.6;">${post.content}</div>
        ${post.image ? `<img src="${post.image}" class="post-img">` : ''}
        
        <div class="post-actions">
            <div class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.key}')">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${post.likes ? post.likes.length : 0} Likes
            </div>
            <div class="action-btn" onclick="toggleCommentSection(this)">
                <i class="far fa-comment"></i> ${post.comments ? post.comments.length : 0} Comments
            </div>
            ${post.isLive ? `<div class="action-btn" style="color:red;" onclick="openVideoModal()"><i class="fas fa-video"></i> Watch</div>` : ''}
        </div>

        <div class="comments-section">
            <div class="comments-list">
                ${(post.comments || []).map(c => `<div class="comment"><b>${c.author}:</b> ${c.text}</div>`).join('')}
            </div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <input type="text" class="input-modern" placeholder="Write a comment..." style="margin:0; padding:8px;">
                <button class="btn-modern" style="padding:8px 15px;" onclick="addComment('${post.key}', this)">Send</button>
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

function toggleLike(postKey) {
    const postRef = db.ref('posts/' + postKey);
    postRef.transaction((encryptedVal) => {
        if (encryptedVal) {
            let post = decryptData(encryptedVal);
            if(!post.likes) post.likes = [];
            
            if(post.likes.includes(currentUser)) {
                post.likes = post.likes.filter(u => u !== currentUser);
            } else {
                post.likes.push(currentUser);
            }
            return encryptData(post);
        }
        return encryptedVal;
    });
}

function addComment(postKey, btn) {
    const input = btn.previousElementSibling;
    const text = input.value;
    if(!text) return;
    
    const postRef = db.ref('posts/' + postKey);
    postRef.transaction((encryptedVal) => {
        if (encryptedVal) {
            let post = decryptData(encryptedVal);
            if(!post.comments) post.comments = [];
            post.comments.push({ author: currentUser, text: text, date: Date.now() });
            return encryptData(post);
        }
        return encryptedVal;
    });
}

/* --- TIMELINE & FRIENDS --- */
async function openTimeline(username) {
    viewedProfile = username;
    switchView('timeline');
    
    document.getElementById('profile-username').innerText = username;
    document.getElementById('profile-avatar-display').innerText = username[0].toUpperCase();
    
    const snapshot = await db.ref('users/' + currentUser).once('value');
    const myData = snapshot.val() || {};
    const friends = myData.friends || [];
    const isFriend = friends.includes(username);
    
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
    await db.ref(`users/${currentUser}/friends`).transaction(friends => {
        if(!friends) friends = [];
        if(!friends.includes(viewedProfile)) friends.push(viewedProfile);
        return friends;
    });
    // Mutual Friend Add
    await db.ref(`users/${viewedProfile}/friends`).transaction(friends => {
        if(!friends) friends = [];
        if(!friends.includes(currentUser)) friends.push(currentUser);
        return friends;
    });
    
    showCustomAlert("Friend Added!", "fa-user-plus");
    openTimeline(viewedProfile); 
}

function messageFriendAction() {
    // When messaging a friend, we treat it as a direct message (not group)
    selectChat(viewedProfile, viewedProfile, false);
    switchView('messages');
}

/* --- MESSAGING & GROUPS --- */
function createGroupChat() {
    showCustomPrompt("Enter Group Name:", async (groupName) => {
        const groupId = 'group_' + Date.now();
        const data = { name: groupName, type: 'group' };
        
        // Add to current user's group list (Simplified: only creator sees it initially)
        await db.ref(`users/${currentUser}/groups/${groupId}`).set(data);
        showCustomAlert("Group created! Check chat list.", "fa-users");
    });
}

function renderFriendList() {
    const list = document.getElementById('msg-friend-list');
    
    db.ref(`users/${currentUser}/friends`).on('value', snapshot => {
        const friends = snapshot.val() || [];
        let html = '<div style="padding: 10px; font-weight: bold; opacity: 0.5; display: flex; justify-content: space-between; align-items: center;"><span>CHATS</span><i class="fas fa-plus-circle" style="cursor: pointer; color: var(--accent-color);" onclick="createGroupChat()" title="Create Group"></i></div>';
        
        // Load Groups (Nested listener for patch simplicity)
        db.ref(`users/${currentUser}/groups`).on('value', groupSnap => {
            const groups = groupSnap.val() || {};
            
            // Render Groups
            Object.keys(groups).forEach(gId => {
                const g = groups[gId];
                html += `<div class="friend-item ${currentChatPartner === gId ? 'active' : ''}" onclick="selectChat('${gId}', '${g.name}', true)">
                    <div style="width:30px;height:30px;background:var(--accent-gradient);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-users"></i></div>
                    ${g.name}
                </div>`;
            });

            // Render Friends
            friends.forEach(f => {
                html += `<div class="friend-item ${currentChatPartner === f ? 'active' : ''}" onclick="selectChat('${f}', '${f}', false)">
                    <div style="width:30px;height:30px;background:#ddd;border-radius:50%;display:flex;align-items:center;justify-content:center;">${f[0]}</div>
                    ${f}
                </div>`;
            });
            list.innerHTML = html;
        });
    });
}

function selectChat(id, name, isGroup) {
    currentChatPartner = id;
    currentChatIsGroup = isGroup;
    
    document.getElementById('chat-window').innerHTML = ''; 
    document.getElementById('chat-with-name').innerText = isGroup ? `Group: ${name}` : `Chat with ${name}`;
    
    if(chatListenerRef) chatListenerRef.off();
    
    // Determine Room ID: Group ID or sorted names for DM
    const room = isGroup ? id : [currentUser, currentChatPartner].sort().join('_');
    window.currentRoomId = room; // Set global room for calls

    chatListenerRef = db.ref('chats/' + room);
    
    chatListenerRef.on('child_added', snapshot => {
        const msg = decryptData(snapshot.val());
        if(msg) {
            const container = document.getElementById('chat-window');
            const isMine = msg.author === currentUser;
            const div = document.createElement('div');
            div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}`;
            
            // Show author name in group chats if not mine
            const authorTag = (isGroup && !isMine) ? `<div style="font-size:0.7rem; opacity:0.7; margin-bottom:2px;">${msg.author}</div>` : '';

            div.innerHTML = `
                ${authorTag}
                ${msg.text}
                ${msg.image ? `<br><img src="${msg.image}" style="max-width:200px; border-radius:12px; margin-top:8px;">` : ''}
            `;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight; 
        }
    });
}

async function sendMessage() {
    if(!currentUser || !currentChatPartner) return showCustomAlert("Select a chat first", "fa-comment-slash");
    const txt = document.getElementById('msg-input').value;
    const fileInput = document.getElementById('msg-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    // Use currentRoomId determined in selectChat
    const data = { author: currentUser, text: txt, image: imgData };
    
    db.ref('chats/' + window.currentRoomId).push(encryptData(data));
    
    document.getElementById('msg-input').value = '';
    fileInput.value = '';
}

/* --- VIDEO CALL (SCOPED) --- */
let localStream;
let peerConnection;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function openVideoModal() { 
    // Only open if watching stream OR inside a chat room
    if(!window.currentRoomId && !document.getElementById('video-modal').style.display === 'flex') {
         // Maybe watching a livestream? Allow for that logic later, for now check room.
    }
    document.getElementById('video-modal').style.display = 'flex'; 
    initLocalVideo(); 
}

function closeVideo() { 
    document.getElementById('video-modal').style.display = 'none'; 
    if(localStream) localStream.getTracks().forEach(t=>t.stop()); 
    if(peerConnection) peerConnection.close();
}

async function initLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
    } catch(e) {
        showCustomAlert("Camera Error: " + e.message, "fa-video-slash");
    }
}

async function startHost() {
    if(!window.currentRoomId) return showCustomAlert("Open a chat to call!", "fa-phone-slash");
    
    document.getElementById('video-status').innerText = "Calling...";
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    
    // Scoped DB path
    const callPath = 'calls/' + window.currentRoomId;

    peerConnection.onicecandidate = e => {
        if(e.candidate) db.ref(`${callPath}/host_candidate`).set(JSON.stringify(e.candidate));
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await db.ref(`${callPath}/offer`).set(JSON.stringify(peerConnection.localDescription));
    
    db.ref(`${callPath}/answer`).on('value', snapshot => {
        const data = snapshot.val();
        if(data && !peerConnection.currentRemoteDescription) {
            const answer = JSON.parse(data);
            peerConnection.setRemoteDescription(answer);
            document.getElementById('video-status').innerText = "Connected";
        }
    });
    
    db.ref(`${callPath}/join_candidate`).on('value', snapshot => {
        const data = snapshot.val();
        if(data) peerConnection.addIceCandidate(JSON.parse(data));
    });
}

async function startJoin() {
    // If watching a livestream (no room ID), logic would differ here. 
    // Assuming standard call for now based on context.
    if(!window.currentRoomId) return showCustomAlert("Open a chat to join!", "fa-phone-slash");
    
    const callPath = 'calls/' + window.currentRoomId;
    const snapshot = await db.ref(`${callPath}/offer`).once('value');
    
    if(!snapshot.exists()) return showCustomAlert("No active call found.", "fa-phone-slash");

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    peerConnection.onicecandidate = e => {
        if(e.candidate) db.ref(`${callPath}/join_candidate`).set(JSON.stringify(e.candidate));
    };

    const offer = JSON.parse(snapshot.val());
    await peerConnection.setRemoteDescription(offer);
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    await db.ref(`${callPath}/answer`).set(JSON.stringify(peerConnection.localDescription));
    document.getElementById('video-status').innerText = "Connected";
    
    db.ref(`${callPath}/host_candidate`).on('value', snapshot => {
        const data = snapshot.val();
        if(data) peerConnection.addIceCandidate(JSON.parse(data));
    });
}
