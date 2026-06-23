/* --- CONFIG & STATE --- */
let client;
let accessToken = null;
let currentAccountCode = null;

// Структура данных, которая полностью улетает в облако Google Drive
let profileData = {
    firstname: '',
    lastname: '',
    age: '',
    email: '',
    companyName: 'Not registered in any company',
    avatarUrl: '' // Хранит картинку в формате Base64
};

// Сессионные структуры в ОЗУ
let userContacts = [];
let userDocuments = [];
let userVirtualNumbers = [];

const DRIVE_API_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const PROFILE_FILE_NAME = 'google_dashboard_profile.json';

/* --- INITIALIZATION & AUTH --- */
window.onload = function() {
    // Инициализация кнопки авторизации
    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (!client) initClient();
            client.requestAccessToken();
        });
    }
    
    // Перехват отправки формы регистрации
    const setupForm = document.getElementById('profileSetupForm');
    if (setupForm) setupForm.addEventListener('submit', handleProfileSetupSubmit);
    
    // Обработка загрузки аватарок/логотипов
    const setupAvatar = document.getElementById('setupAvatarInput');
    if (setupAvatar) setupAvatar.addEventListener('change', handleSetupAvatarUpload);

    const editAvatar = document.getElementById('editAvatarInput');
    if (editAvatar) editAvatar.addEventListener('change', handleEditAvatarUpload);

    // Инициализация темы и языка
    const savedTheme = localStorage.getItem('site-theme') || 'light';
    setTheme(savedTheme);
    changeLanguage(currentLang);
};

function initClient() {
    client = google.accounts.oauth2.initTokenClient({
        client_id: '965389602517-m0j06n6or59p875b2p9q00a5rffid3vs.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/drive.appdata',
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                await fetchGoogleIdentity();
            }
        },
    });
}

async function fetchGoogleIdentity() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        currentAccountCode = btoa(data.email).replace(/=/g, "");
        sessionStorage.setItem('currentClientCode', currentAccountCode);
        
        profileData.email = data.email;

        // Ищем существующий профиль в Google Drive
        const driveData = await loadProfileFromGoogleDrive();
        document.getElementById('authWindow').style.display = 'none';

        if (!driveData) {
            // Если файла нет — открываем окно дорегистрации (Возраст, Аватар, Компания)
            document.getElementById('setupProfileWindow').style.display = 'block';
            document.getElementById('setupFirstname').value = data.given_name || '';
            document.getElementById('setupLastname').value = data.family_name || '';
        } else {
            // Если файл найден — подгружаем его и пускаем в систему
            profileData = driveData;
            loadDashboard();
        }
    } catch (err) {
        console.error("Auth pipeline error:", err);
    }
}

/* --- GOOGLE DRIVE CORE SYNC (appDataFolder) --- */
async function loadProfileFromGoogleDrive() {
    try {
        const searchUrl = `${DRIVE_API_FILES_URL}?q=name='${PROFILE_FILE_NAME}' and 'appDataFolder' in parents&spaces=appDataFolder`;
        const res = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        
        if (data.files && data.files.length > 0) {
            const fileId = data.files[0].id;
            const fileRes = await fetch(`${DRIVE_API_FILES_URL}/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            return await fileRes.json();
        }
        return null;
    } catch (e) {
        console.error("Cloud read failed:", e);
        return null;
    }
}

async function saveProfileToGoogleDrive() {
    try {
        const searchUrl = `${DRIVE_API_FILES_URL}?q=name='${PROFILE_FILE_NAME}' and 'appDataFolder' in parents&spaces=appDataFolder`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const searchData = await searchRes.json();
        
        const boundary = 'cloud_profile_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        
        let url = DRIVE_API_FILES_URL;
        let method = 'POST';
        const metadata = { name: PROFILE_FILE_NAME };
        
        if (searchData.files && searchData.files.length > 0) {
            const fileId = searchData.files[0].id;
            url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            method = 'PATCH';
        } else {
            metadata.parents = ['appDataFolder'];
            url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        }
        
        const body = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(profileData) +
            closeDelimiter;
            
        await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: body
        });
        console.log("Profile successfully synced with Google Account Cloud!");
    } catch (e) {
        console.error("Cloud write failed:", e);
    }
}

/* --- IMAGE HANDLING (BASE64) --- */
function handleSetupAvatarUpload(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            profileData.avatarUrl = evt.target.result;
            const preview = document.getElementById('setupAvatarPreview');
            preview.innerText = "";
            preview.style.backgroundImage = `url(${profileData.avatarUrl})`;
        };
        reader.readAsDataURL(file);
    }
}

function handleEditAvatarUpload(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = async function(evt) {
            profileData.avatarUrl = evt.target.result;
            updateAvatarUI(profileData.avatarUrl);
            await saveProfileToGoogleDrive();
        };
        reader.readAsDataURL(file);
    }
}

function updateAvatarUI(avatarData) {
    const editPreview = document.getElementById('editAvatarPreview');
    const sidebarPreview = document.getElementById('sidebarAvatar');
    
    if(avatarData) {
        if(editPreview) { editPreview.innerText = ""; editPreview.style.backgroundImage = `url(${avatarData})`; }
        if(sidebarPreview) { sidebarPreview.innerText = ""; sidebarPreview.style.backgroundImage = `url(${avatarData})`; }
    } else {
        if(editPreview) { editPreview.innerText = "👤"; editPreview.style.backgroundImage = "none"; }
        if(sidebarPreview) { sidebarPreview.innerText = "👤"; sidebarPreview.style.backgroundImage = "none"; }
    }
}

/* --- SUBMITS & APP LOAD --- */
async function handleProfileSetupSubmit(e) {
    e.preventDefault();
    const age = parseInt(document.getElementById('setupAge').value);
    if (age < 7) {
        document.getElementById('ageSetupError').style.display = 'block';
        return;
    }
    document.getElementById('ageSetupError').style.display = 'none';

    profileData.firstname = document.getElementById('setupFirstname').value;
    profileData.lastname = document.getElementById('setupLastname').value;
    profileData.age = age;

    await saveProfileToGoogleDrive();
    document.getElementById('setupProfileWindow').style.display = 'none';
    loadDashboard();
}

function loadDashboard() {
    document.getElementById('mainApp').style.display = 'flex';
    
    document.getElementById('editFirstname').value = profileData.firstname;
    document.getElementById('editLastname').value = profileData.lastname;
    document.getElementById('editEmail').value = profileData.email;
    
    updateAvatarUI(profileData.avatarUrl);
    switchPage('page-phone', document.querySelector('.nav-btn'));
    renderGmailInbox();
    renderContacts();
    renderDocuments();
    evaluateCompanyState();
    populateNumbersSelect();
}

/* --- NAVIGATION & MODALS --- */
function switchPage(pageId, btnElement) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(pageId).classList.add('active');
    if(btnElement) btnElement.classList.add('active');
}

function openModal(mId) { document.getElementById(mId).style.display = 'flex'; }
function closeModal(mId) { document.getElementById(mId).style.display = 'none'; }

/* --- GMAIL INTEGRATION --- */
function renderGmailInbox() {
    const container = document.getElementById('emails-list');
    const mailUserTitle = document.getElementById('user-email');
    
    if(!accessToken) return;
    mailUserTitle.innerText = profileData.email;

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    .then(res => res.json())
    .then(data => {
        container.innerHTML = '';
        if(!data.messages || data.messages.length === 0) {
            container.innerHTML = '<div class="empty-placeholder">Ваш почтовый ящик пуст.</div>';
            return;
        }
        data.messages.forEach(msg => {
            fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            .then(r => r.json())
            .then(fullMsg => {
                const headers = fullMsg.payload.headers;
                const subject = (headers.find(h => h.name === 'Subject') || {value: '(No Subject)'}).value;
                const from = (headers.find(h => h.name === 'From') || {value: 'Unknown'}).value;
                const isUnread = fullMsg.labelIds.includes('UNREAD');

                const item = document.createElement('div');
                item.className = `email-item ${isUnread ? 'email-item-unread' : ''}`;
                item.innerHTML = `<div><div style="font-size:14px; font-weight:600;">${from}</div><div style="font-size:13px; color:gray;">${subject}</div></div><span style="font-size:11px; color:#999;">✉️</span>`;
                
                item.onclick = () => openEmailViewer(fullMsg, from, subject);
                container.appendChild(item);
            });
        });
    }).catch(() => {
        container.innerHTML = '<div class="empty-placeholder">Ошибка загрузки Gmail.</div>';
    });
}

function openEmailViewer(fullMsg, from, subject) {
    document.getElementById('gmailViewSubject').innerText = subject;
    document.getElementById('gmailViewFrom').innerText = from;
    document.getElementById('gmailReplyForm').style.display = 'none';
    document.getElementById('gmailReplyBody').value = '';
    document.getElementById('gmailViewBody').innerText = fullMsg.snippet || "No preview available.";

    document.getElementById('gmailReplyForm').dataset.threadId = fullMsg.threadId;
    document.getElementById('gmailReplyForm').dataset.toEmail = from;
    document.getElementById('gmailReplyForm').dataset.subject = subject;

    openModal('gmailViewModal');
}

document.getElementById('gmailComposeForm').onsubmit = function(e) {
    e.preventDefault();
    const to = document.getElementById('gmailTo').value;
    const subject = document.getElementById('gmailSubject').value;
    const body = document.getElementById('gmailBody').value;

    const emailContent = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
    const base64SafeEmail = btoa(unescape(encodeURIComponent(emailContent))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64SafeEmail })
    }).then(() => {
        alert("Письмо успешно отправлено!");
        closeModal('gmailComposeModal');
        this.reset();
        renderGmailInbox();
    });
};

/* --- VIRTUAL PHONE --- */
let dailyPool = [];
function openNumberRegModal() {
    const select = document.getElementById('regNumberPoolSelect');
    const region = document.getElementById('regNumberRegion').value;
    select.innerHTML = '';
    dailyPool = [];
    
    for(let i=0; i<4; i++) {
        let generated = Math.floor(1000000 + Math.random() * 9000000).toString();
        dailyPool.push(region + " " + generated);
    }
    dailyPool.forEach(num => {
        let opt = document.createElement('option');
        opt.value = num; opt.innerText = num;
        select.appendChild(opt);
    });
    openModal('numberRegModal');
}

function saveRegisteredNumber() {
    const chosen = document.getElementById('regNumberPoolSelect').value;
    if(!userVirtualNumbers.includes(chosen)) userVirtualNumbers.push(chosen);
    closeModal('numberRegModal');
    populateNumbersSelect();
}

function populateNumbersSelect() {
    const select = document.getElementById('myNumbersSelect');
    if(!select) return;
    select.innerHTML = '';
    if(userVirtualNumbers.length === 0) {
        select.innerHTML = '<option>No virtual lines</option>';
        return;
    }
    userVirtualNumbers.forEach(n => {
        let op = document.createElement('option');
        op.value = n; op.innerText = n; select.appendChild(op);
    });
}

function makeCall() {
    const num = document.getElementById('dialNumberInput').value;
    if(num) alert(`Uplink voice line connection initialized to node: ${num}`);
}

/* --- CONTACTS --- */
function renderContacts() {
    const container = document.getElementById('contactsContainer');
    if(!container) return; container.innerHTML = '';
    if(userContacts.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No integrated system contacts found.</div>';
        return;
    }
    userContacts.forEach((c, idx) => {
        let div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `<div><strong>${c.firstname} ${c.lastname}</strong><br><small style="color:gray;">${c.phone}</small></div><button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteContact(${idx})">X</button>`;
        container.appendChild(div);
    });
}

document.getElementById('contactForm').onsubmit = function(e) {
    e.preventDefault();
    const fullPhone = document.getElementById('conCode').value + " " + document.getElementById('conNumber').value;
    userContacts.push({
        firstname: document.getElementById('conFirstname').value,
        lastname: document.getElementById('conLastname').value,
        phone: fullPhone
    });
    closeModal('contactModal');
    this.reset();
    renderContacts();
};

function deleteContact(idx) { userContacts.splice(idx, 1); renderContacts(); }

/* --- COMPANY --- */
function evaluateCompanyState() {
    if(profileData.companyName && profileData.companyName !== 'Not registered in any company') {
        document.getElementById('companyStateUnregistered').style.display = 'none';
        document.getElementById('companyStateDashboard').style.display = 'flex';
        renderCompanyDashboard();
    } else {
        document.getElementById('companyStateUnregistered').style.display = 'block';
        document.getElementById('companyStateDashboard').style.display = 'none';
    }
}

document.getElementById('companyCreateForm').onsubmit = async function(e) {
    e.preventDefault();
    profileData.companyName = document.getElementById('creationCompName').value;
    await saveProfileToGoogleDrive();
    closeModal('companyCreateModal');
    this.reset();
    evaluateCompanyState();
};

document.getElementById('companyJoinForm').onsubmit = async function(e) {
    e.preventDefault();
    profileData.companyName = document.getElementById('joinCompCode').value.trim();
    await saveProfileToGoogleDrive();
    closeModal('companyJoinModal');
    this.reset();
    evaluateCompanyState();
};

function renderCompanyDashboard() {
    document.getElementById('compDashboardName').innerText = profileData.companyName;
    document.getElementById('companyMembersContainer').innerHTML = `<div class="list-item"><span><strong>${profileData.firstname} ${profileData.lastname} (You)</strong></span><span class="btn btn-secondary" style="font-size:11px; padding:3px 8px;">Authorized Owner</span></div>`;
}

function openCompanySettingsModal() {
    document.getElementById('setCompName').value = profileData.companyName;
    openModal('companySettingsModal');
}

async function saveCompanyProfileChanges() {
    profileData.companyName = document.getElementById('setCompName').value;
    await saveProfileToGoogleDrive();
    renderCompanyDashboard();
    closeModal('companySettingsModal');
}

/* --- DOCUMENTS --- */
function renderDocuments() {
    const container = document.getElementById('documentsContainer');
    if(!container) return; container.innerHTML = '';
    if(userDocuments.length === 0) {
        container.innerHTML = '<div class="empty-placeholder"> Centralized datastore contains no active assets.</div>';
        return;
    }
    userDocuments.forEach(d => {
        let item = document.createElement('div');
        item.style.padding = '15px'; item.style.border = '1px solid var(--border-color)';
        item.style.borderRadius = '8px'; item.style.background = 'var(--input-bg)'; item.style.marginBottom = '10px';
        item.innerHTML = `<h4 style="font-weight: ${d.style}; margin-bottom:5px; color: var(--accent-color);">${d.title}</h4><p style="font-size:13px; white-space:pre-wrap;">${d.content}</p>`;
        container.appendChild(item);
    });
}

document.getElementById('documentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    userDocuments.push({
        title: document.getElementById('docTitle').value,
        style: document.getElementById('docFontWeight').value,
        content: document.getElementById('docContent').value
    });
    closeModal('documentModal');
    this.reset();
    renderDocuments();
});

/* --- SYSTEM CONFIGURATION --- */
document.getElementById('editProfileForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    profileData.firstname = document.getElementById('editFirstname').value;
    profileData.lastname = document.getElementById('editLastname').value;
    await saveProfileToGoogleDrive();
    alert('Профиль успешно обновлен в облаке Google!');
});

function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('site-theme', themeName);
}

function logout() { 
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            accessToken = null;
            currentAccountCode = null;
            profileData = { firstname: '', lastname: '', age: '', email: '', companyName: 'Not registered in any company', avatarUrl: '' };
            document.getElementById('mainApp').style.display = 'none';
            document.getElementById('authWindow').style.display = 'block';
        });
    }
}

// i18n Языковой движок
const translations = {
    en: { appTitle: "Interactive Dashboard", authDesc: "For secure access and automated synchronization with your corporate inbox, authenticate with your Google account.", googleLoginBtn: "Sign in with Google", setupTitle: "Complete Registration", setupDesc: "Please provide your details to establish a working system profile." },
    ru: { appTitle: "Интерактивная Панель", authDesc: "Для безопасного входа и автоматической синхронизации с вашей корпоративной почтой авторизуйтесь через Google-аккаунт.", googleLoginBtn: "Войти через Google", setupTitle: "Завершение регистрации", setupDesc: "Пожалуйста, укажите ваши данные для создания рабочего профиля." }
};
let currentLang = localStorage.getItem('app-lang') || 'en';
function changeLanguage(langCode) {
    currentLang = langCode; localStorage.setItem('app-lang', langCode);
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(translations[currentLang]?.[key]) el.innerText = translations[currentLang][key];
    });
}
