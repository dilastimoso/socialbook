/* --- FIREBASE CONFIGURATION --- */
const firebaseConfig = {
    apiKey: "AIzaSyCjcgPGmI9Y1AxAu5pCfP-MNpwp7YdCcrI",
    authDomain: "socialbook-93e5f.firebaseapp.com",
    projectId: "socialbook-93e5f",
    storageBucket: "socialbook-93e5f.firebasestorage.app",
    messagingSenderId: "260794751969",
    appId: "1:260794751969:web:c638b4aed54c42cace10a0",
    measurementId: "G-62GVYYQWFQ",
    // I constructed this from your Project ID. 
    // If chat doesn't work, check "Realtime Database" > "Data" tab in Firebase Console for the exact URL.
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
let viewedProfile = null;
const GLOBAL_NET_KEY = "SocialBook_Universal_Link_2026";
let chatListenerRef = null; 

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
    if(!u || !p) return alert("Fill fields");

    const fakeEmail = u + "@socialbook.com";

    try {
        await auth.createUserWithEmailAndPassword(fakeEmail, p);
        await db.ref('users/' + u).set({ friends: [] });
        alert("Account Created!");
    } catch (error) {
        alert("Error: " + error.message);
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
        alert("Login Failed: " + error.message);
        loading.style.display = 'none';
    }
}

/* --- POSTS (REALTIME FEED) --- */
async function createPost() {
    if(!currentUser) return;
    const txt = document.getElementById('post-input').value;
    const fileInput = document.getElementById('post-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const data = { 
        author: currentUser, 
        content: txt, 
        image: imgData, 
        date: new Date().toLocaleString(),
        likes: [], 
        comments: [] 
    };

    const encrypted = encryptData(data);
    db.ref('posts').push(encrypted);

    document.getElementById('post-input').value = '';
    fileInput.value = '';
}

function loadFeed(filterUser = null) {
    const container = filterUser ? document.getElementById('timeline-stream') : document.getElementById('feed-stream');
    
    // Using 'child_added' for smoother updates usually, but 'value' is simpler for sorting here
    db.ref('posts').on('value', (snapshot) => {
        container.innerHTML = ''; 
        const posts = [];
        snapshot.forEach(childSnapshot => {
            const post = decryptData(childSnapshot.val());
            if(post) {
                post.key = childSnapshot.key;
                posts.push(post);
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
            <div class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.key}')">
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
    
    alert("Friend Added!");
    openTimeline(viewedProfile); 
}

function messageFriendAction() {
    currentChatPartner = viewedProfile;
    switchView('messages');
}

/* --- MESSAGING --- */
function renderFriendList() {
    const list = document.getElementById('msg-friend-list');
    db.ref(`users/${currentUser}/friends`).on('value', snapshot => {
        const friends = snapshot.val() || [];
        let html = '<div style="padding: 10px; font-weight: bold; opacity: 0.5;">FRIENDS</div>';
        friends.forEach(f => {
            html += `<div class="friend-item ${currentChatPartner === f ? 'active' : ''}" onclick="selectChat('${f}')">
                <div style="width:30px;height:30px;background:#ddd;border-radius:50%;display:flex;align-items:center;justify-content:center;">${f[0]}</div>
                ${f}
            </div>`;
        });
        list.innerHTML = html;
    });
}

function selectChat(friend) {
    currentChatPartner = friend;
    document.getElementById('chat-window').innerHTML = ''; 
    document.getElementById('chat-with-name').innerText = `Chat with ${currentChatPartner}`;
    
    if(chatListenerRef) chatListenerRef.off();
    
    const room = [currentUser, currentChatPartner].sort().join('_');
    chatListenerRef = db.ref('chats/' + room);
    
    chatListenerRef.on('child_added', snapshot => {
        const msg = decryptData(snapshot.val());
        if(msg) {
            const container = document.getElementById('chat-window');
            const isMine = msg.author === currentUser;
            const div = document.createElement('div');
            div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}`;
            div.innerHTML = `
                ${msg.text}
                ${msg.image ? `<br><img src="${msg.image}" style="max-width:200px; border-radius:12px; margin-top:8px;">` : ''}
            `;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight; 
        }
    });
}

async function sendMessage() {
    if(!currentUser || !currentChatPartner) return alert("Select a friend");
    const txt = document.getElementById('msg-input').value;
    const fileInput = document.getElementById('msg-image');
    if(!txt && !fileInput.files[0]) return;

    let imgData = null;
    if(fileInput.files[0]) imgData = await toBase64(fileInput.files[0]);

    const room = [currentUser, currentChatPartner].sort().join('_');
    const data = { author: currentUser, text: txt, image: imgData };
    
    db.ref('chats/' + room).push(encryptData(data));
    
    document.getElementById('msg-input').value = '';
    fileInput.value = '';
}

/* --- VIDEO CALL --- */
let localStream;
let peerConnection;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function openVideoModal() { document.getElementById('video-modal').style.display = 'flex'; initLocalVideo(); }
function closeVideo() { 
    document.getElementById('video-modal').style.display = 'none'; 
    if(localStream) localStream.getTracks().forEach(t=>t.stop()); 
}

async function initLocalVideo() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
}

async function startHost() {
    document.getElementById('video-status').innerText = "Calling...";
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    peerConnection.onicecandidate = e => {
        if(e.candidate) db.ref('calls/host_candidate').set(JSON.stringify(e.candidate));
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await db.ref('calls/offer').set(JSON.stringify(peerConnection.localDescription));
    
    db.ref('calls/answer').on('value', snapshot => {
        const data = snapshot.val();
        if(data && !peerConnection.currentRemoteDescription) {
            const answer = JSON.parse(data);
            peerConnection.setRemoteDescription(answer);
            document.getElementById('video-status').innerText = "Connected";
        }
    });
    
    db.ref('calls/join_candidate').on('value', snapshot => {
        const data = snapshot.val();
        if(data) peerConnection.addIceCandidate(JSON.parse(data));
    });
}

async function startJoin() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    peerConnection.onicecandidate = e => {
        if(e.candidate) db.ref('calls/join_candidate').set(JSON.stringify(e.candidate));
    };

    const snapshot = await db.ref('calls/offer').once('value');
    const offer = JSON.parse(snapshot.val());
    await peerConnection.setRemoteDescription(offer);
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    await db.ref('calls/answer').set(JSON.stringify(peerConnection.localDescription));
    document.getElementById('video-status').innerText = "Connected";
    
    db.ref('calls/host_candidate').on('value', snapshot => {
        const data = snapshot.val();
        if(data) peerConnection.addIceCandidate(JSON.parse(data));
    });
}
