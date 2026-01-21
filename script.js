let dbx;
let networkKey = ""; // Stores the encryption password
let peerConnection;
let localStream;
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- SECURITY PROTOCOLS ---

function encryptData(dataObject) {
    if (!networkKey) return JSON.stringify(dataObject);
    const jsonString = JSON.stringify(dataObject);
    return CryptoJS.AES.encrypt(jsonString, networkKey).toString();
}

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

// --- AI MODERATION LAYER ---
function aiSafetyScan(text) {
    const violations = [
        /hate/i, /kill/i, /stupid/i, /scam/i, /violence/i, 
        /attack/i, /abuse/i, /bomb/i, /die/i
    ];
    
    for (let pattern of violations) {
        if (pattern.test(text)) {
            return false;
        }
    }
    return true;
}

// 1. Initialize App (WITH HARDCODED TOKEN)
function initApp() {
    // --- HARDCODED TOKEN START ---
    const token = "sl.u.AGQZC-vOPB5s89pRFwIK9dWv8___s4aaQHWbK1BS4LKkcFsBhsR7aMZkHLmiDiXP4ALEboMeUMUyu0xmQpWN1AG41bO9QwJvsIaHeQ4avp1tZjFz5c8JxZCLjSyg49tgV_hbtil5XCpYwyaOvXA0TK09XPXhWDGY3VED30bh9iPdkgbDGRNMI55yi4I_LxCNE8x9ol_pxVWASJ3SwD0oIteD6CHtxzkmkTPX26mL_PwikB50iQr6m01YUGAvTb7vX0hU7X0A6uN3MnPHGJCBziVN9TcdP6bKYMlEGQLBfmRo554lTNZOsPdq5psJcMraLpgF0YlxnRDINBUi5XUgJfKd4ZJeiGOsOcD4O1u5oqDL2WKUutzRsaU4R5bOchAuubOLkZ9uTbMhDr4icD8BSr_ONGGYrv7Z-LoR9m_TEYNV7zJD0DFYQfUtgCYFvlo4AMOnQdq2TWFzG_pWlHUYhnqh2rVoCTHkg_ccpFXuUiBCeS_EjMJbeYj2bgSg6CVYuVU6kYIB25nwgl04Y26aRkS0D95B2aYcOtFC90LqydNuPZ-trhyq7T2zT6vkPcPKABEB25AqEVRZRUQwj7nuDeDh84ZE51yQydePRx4EJmqQOul9oJts8GyC9eHmGk2Edz6bU5xAwcUNORZudMh2n6mvEAIIxLK4s27t-gXyI1N8YQREE8ewJD0C1y2CfYELQibIGCNoeGj7S-qPIeM7MAsf0oOFNt5Td5zukRnkENFwaBoD7DSlUdidmqKWYEcH5U-O_4fa8OiIjCUj5gU8HGMaaWGog7Hz5Dlb74tToxjqkC-at-6OWEaTIt48_qY91yztRMOSqY3gRexHDKwGmoDVYD7Uty-UCHd314NAIgR-ww_EfyhFsVeCMEPgOpPjzC9mC_XfFTcA-oaljvM8HExlYg3TpknRoAM0ASG7ZID0fGsDEMiBawxnaKXfH7pcUZyT75RjkHc3ZgUSM4sLgqBrcMIqMBF_rp7IwvApNnQ7HtDAvj9dYFGBEj5VGMGomBf9sgvoAn6uNiQ-nMGk431iKZt99-Qa9rcLddbi3POt502n3TY83jeA9rYhs8VI1r-kX-z3IyQV-6HYtiBg8DE_9T78b9xxSRsm2Ek71R4DaNE-j-5bx2BKaWh0CkmiHiWuJL8UTZmF4CZ35CMyBuLoa2qqIken4BvyQDQuI47PgHM3PIkWPnBUCkozLB1FX5j-mJ-NzW3U3EMxF2t9kxKo7v-Cbq-9RbnyRfbGo_VvdOm6rQPPKUFABDF3XGbC-N0OljXeEEi4gR-Wk9edwVBdvHWYYyKsO0EabotvWSsI3Q";
    // --- HARDCODED TOKEN END ---

    const key = document.getElementById('network-key').value;

    if (!key) {
        alert("Network Key required for secure encryption.");
        return;
    }

    dbx = new Dropbox.Dropbox({ accessToken: token });
    networkKey = key; 
    
    document.getElementById('auth-modal').style.display = 'none';
    loadFeed();
}

// 2. Create Post
async function createPost() {
    const input = document.getElementById('post-input');
    const text = input.value;
    if (!text) return;

    // AI Check
    const isSafe = aiSafetyScan(text);
    if (!isSafe) {
        alert("⚠️ AI MODERATION ALERT ⚠️\n\nPost flagged for policy violation.");
        input.style.borderColor = "red";
        setTimeout(() => input.style.borderColor = "var(--glass-border)", 2000);
        return;
    }

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
// VIDEO UPLINK LOGIC (Encrypted)
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
