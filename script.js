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

function encryptData(dataObject) {
    const jsonString = JSON.stringify(dataObject);
    return CryptoJS.AES.encrypt(jsonString, GLOBAL_NET_KEY).toString();
}

function decryptData(ciphertext) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, GLOBAL_NET_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(originalText);
    } catch (e) { return null; }
}

function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

function aiSafetyScan(text) {
    const violations = [/hate/i, /kill/i, /stupid/i, /scam/i, /violence/i, /attack/i, /abuse/i, /bomb/i, /die/i];
    for (let pattern of violations) { if (pattern.test(text)) return false; }
    return true;
}

async function getUsersDB() {
    try {
        const fileData = await dbx.filesDownload({ path: '/socialbook_system/users.json' });
        const text = await fileData.result.fileBlob.text();
        return JSON.parse(text);
    } catch (e) { return {}; }
}

async function handleRegister() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value;
    const loading = document.getElementById('login-loading');
    if (!user || !pass) { alert("Credentials required."); return; }
    loading.style.display = 'block';
    try {
        const db = await getUsersDB();
        if (db[user]) { alert("Identity already exists."); loading.style.display = 'none'; return; }
        db[user] = hashPassword(pass);
        await dbx.filesUpload({ path: '/socialbook_system/users.json', contents: JSON.stringify(db), mode: 'overwrite' });
        alert("Identity Created.");
    } catch (e) { alert("Registration Error."); }
    loading.style.display = 'none';
}

async function handleLogin() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value;
    const loading = document.getElementById('login-loading');
    if (!user || !pass) return;
    loading.style.display = 'block';
    try {
        const db = await getUsersDB();
        if (db[user] === hashPassword(pass)) {
            currentUser = user;
            document.getElementById('auth-modal').style.display = 'none';
            document.querySelector('.user-status').innerHTML = `● ONLINE: ${user}`;
            loadFeed();
        } else { alert("Verification Failed."); }
    } catch (e) { alert("Database error."); }
    loading.style.display = 'none';
}

async function createPost() {
    if (!currentUser) return;
    const input = document.getElementById('post-input');
    if (!aiSafetyScan(input.value)) { alert("AI: Content Violation."); return; }
    const postData = { author: currentUser, content: input.value, date: new Date().toLocaleString() };
    try {
        await dbx.filesUpload({ path: `/socialbook_posts/${Date.now()}.json`, contents: encryptData(postData) });
        input.value = '';
        loadFeed();
    } catch (error) { console.error("Upload Error."); }
}

async function loadFeed() {
    const feedContainer = document.getElementById('feed-stream');
    try {
        const response = await dbx.filesListFolder({ path: '/socialbook_posts' });
        const files = response.result.entries.sort((a, b) => b.name.localeCompare(a.name));
        feedContainer.innerHTML = '';
        for (const file of files) {
            if (!file.name.endsWith('.json')) continue;
            const fileData = await dbx.filesDownload({ path: file.path_lower });
            const text = await fileData.result.fileBlob.text();
            const post = decryptData(text);
            if (post) {
                const div = document.createElement('div');
                div.className = 'glass-panel post';
                div.style.marginBottom = '20px';
                div.innerHTML = `<div class="post-header"><div class="avatar"></div><div><div class="username">${post.author}</div><div class="timestamp">${post.date}</div></div></div><div>${post.content}</div>`;
                feedContainer.appendChild(div);
            }
        }
    } catch (error) { console.error("Sync Error."); }
}

function openVideoModal() { document.getElementById('video-modal').style.display = 'flex'; initLocalVideo(); }
function closeVideo() { document.getElementById('video-modal').style.display = 'none'; if(localStream) localStream.getTracks().forEach(t => t.stop()); }
async function initLocalVideo() { localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); document.getElementById('localVideo').srcObject = localStream; }
async function startHost() {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await new Promise(r => setTimeout(r, 1000));
    await dbx.filesUpload({ path: '/socialbook_calls/offer.json', contents: encryptData(peerConnection.localDescription), mode: 'overwrite' });
    document.getElementById('video-status').innerText = "WAITING FOR PEER...";
}
async function startJoin() {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
    const fileData = await dbx.filesDownload({ path: '/socialbook_calls/offer.json' });
    const offer = decryptData(await fileData.result.fileBlob.text());
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await dbx.filesUpload({ path: '/socialbook_calls/answer.json', contents: encryptData(peerConnection.localDescription), mode: 'overwrite' });
}
