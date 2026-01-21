let dbx;
let networkKey = ""; // Stores the encryption password
let peerConnection;
let localStream;
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- SECURITY PROTOCOLS ---

// Encrypts any object into a scrambled string
function encryptData(dataObject) {
    if (!networkKey) return JSON.stringify(dataObject);
    const jsonString = JSON.stringify(dataObject);
    return CryptoJS.AES.encrypt(jsonString, networkKey).toString();
}

// Decrypts a scrambled string back into an object
function decryptData(ciphertext) {
    if (!networkKey) return JSON.parse(ciphertext);
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, networkKey);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(originalText);
    } catch (e) {
        return null;
    }
}

// --- NEW: AI MODERATION LAYER ---
function aiSafetyScan(text) {
    // Simulated Neural Network Blacklist
    const violations = [
        /hate/i, /kill/i, /stupid/i, /scam/i, /violence/i, 
        /attack/i, /abuse/i, /bomb/i, /die/i
    ];
    
    for (let pattern of violations) {
        if (pattern.test(text)) {
            return false; // AI detected violation
        }
    }
    return true; // Content is safe
}

// 1. Initialize App
function initApp() {
    const token = document.getElementById('dropbox-token').value;
    const key = document.getElementById('network-key').value;

    if (!token || !key) {
        alert("Token and Network Key are required for secure uplink.");
        return;
    }

    dbx = new Dropbox.Dropbox({ accessToken: token });
    networkKey = key; 
    
    document.getElementById('auth-modal').style.display = 'none';
    loadFeed();
}

// 2. Create Post (Now with AI Moderation)
async function createPost() {
    const input = document.getElementById('post-input');
    const text = input.value;
    if (!text) return;

    // STEP 1: AI MODERATION SCAN
    const isSafe = aiSafetyScan(text);
    
    if (!isSafe) {
        alert("⚠️ AI MODERATION ALERT ⚠️\n\nYour post was flagged for violating Community Standards. \n(Detected: Hostility/Violence)");
        input.style.borderColor = "red";
        setTimeout(() => input.style.borderColor = "var(--glass-border)", 2000);
        return; // Stop the function here
    }

    // STEP 2: PROCEED IF SAFE
    const timestamp = new Date();
    const filename = `/socialbook_posts/${timestamp.getTime()}.json`;

    const postData = {
        author: "User_01",
        content: text,
        date: timestamp.toLocaleString()
    };

    const encryptedContent = encryptData(postData);

    try {
        await dbx.filesUpload({
            path: filename,
            contents: encryptedContent
        });

        input.value = '';
        loadFeed();
    } catch (error) {
        console.error("Transmission Error:", error);
    }
}

// 3. Load Feed
async function loadFeed() {
    const feedContainer = document.getElementById('feed-stream');
    try {
        let response;
        try {
            response = await dbx.filesListFolder({ path: '/socialbook_posts' });
        } catch (e) { return; }

        const files = response.result.entries;
        files.sort((a, b) => b.name.localeCompare(a.name));
        feedContainer.innerHTML = '';

        for (const file of files) {
            if (!file.name.endsWith('.json')) continue;

            const fileData = await dbx.filesDownload({ path: file.path_lower });
            const blob = fileData.result.fileBlob;
            const text = await blob.text();

            const post = decryptData(text);

            if (post) {
                renderPost(post);
            } else {
                renderCorruptedPost();
            }
        }
    } catch (error) {
        console.error("Downlink Error:", error);
    }
}

function renderPost(post) {
    const feedContainer = document.getElementById('feed-stream');
    const div = document.createElement('div');
    div.className = 'glass-panel post';
    div.innerHTML = `
        <div class="post-header">
            <div class="avatar"></div>
            <div>
                <div class="username">${post.author}</div>
                <div class="timestamp">${post.date}</div>
            </div>
        </div>
        <div class="post-content">${post.content}</div>
    `;
    feedContainer.appendChild(div);
}

function renderCorruptedPost() {
    const feedContainer = document.getElementById('feed-stream');
    const div = document.createElement('div');
    div.className = 'glass-panel post';
    div.style.opacity = '0.5';
    div.innerHTML = `<div style="color: red; font-family: monospace;">[ENCRYPTED DATA] - ACCESS DENIED</div>`;
    feedContainer.appendChild(div);
}

// ==========================================
// VIDEO UPLINK LOGIC (Unchanged)
// ==========================================

function openVideoModal() {
    document.getElementById('video-modal').style.display = 'flex';
    initLocalVideo();
}

function closeVideo() {
    document.getElementById('video-modal').style.display = 'none';
    if(localStream) localStream.getTracks().forEach(track => track.stop());
    if(peerConnection) peerConnection.close();
}

async function initLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
    } catch (e) {
        alert("Camera access denied.");
    }
}

async function startHost() {
    document.getElementById('video-status').innerText = "ENCRYPTING SIGNAL...";
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        document.getElementById('remoteVideo').srcObject = event.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const encryptedSignal = encryptData(peerConnection.localDescription);
    
    await dbx.filesUpload({ 
        path: '/socialbook_calls/offer.json', 
        contents: encryptedSignal,
        mode: 'overwrite' 
    });

    document.getElementById('video-status').innerText = "WAITING FOR SECURE HANDSHAKE...";
    checkForAnswer();
}

async function startJoin() {
    document.getElementById('video-status').innerText = "DECRYPTING SIGNAL...";
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        document.getElementById('remoteVideo').srcObject = event.streams[0];
        document.getElementById('video-status').innerText = "SECURE UPLINK ESTABLISHED";
    };

    try {
        const fileData = await dbx.filesDownload({ path: '/socialbook_calls/offer.json' });
        const text = await fileData.result.fileBlob.text();
        
        const offer = decryptData(text);
        if(!offer) throw new Error("Invalid Key");

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const encryptedAnswer = encryptData(peerConnection.localDescription);

        await dbx.filesUpload({ 
            path: '/socialbook_calls/answer.json', 
            contents: encryptedAnswer,
            mode: 'overwrite'
        });

        document.getElementById('video-status').innerText = "CONNECTING...";

    } catch (e) {
        alert("Signal decryption failed. Wrong Network Key?");
    }
}

async function checkForAnswer() {
    const interval = setInterval(async () => {
        try {
            const fileData = await dbx.filesDownload({ path: '/socialbook_calls/answer.json' });
            const text = await fileData.result.fileBlob.text();
            const answer = decryptData(text);
            
            if (answer) {
                await peerConnection.setRemoteDescription(answer);
                document.getElementById('video-status').innerText = "SECURE UPLINK ESTABLISHED";
                clearInterval(interval);
            }
        } catch (e) { }
    }, 2000);
}
