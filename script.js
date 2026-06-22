// --- КОНФИГУРАЦИЯ GOOGLE AUTH ---
const CLIENT_ID = '565975442884-sea3ig36td6ofhsd2932oo8rjcp7j5kl.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
let tokenClient;
let accessToken = null;

let currentAccountCode = null;

window.onload = function() {
    const savedTheme = localStorage.getItem('site-theme') || 'light';
    setTheme(savedTheme);
    const sessionCode = sessionStorage.getItem('currentClientCode');
    if (sessionCode && localStorage.getItem('user_' + sessionCode)) {
        loginToApp(sessionCode);
    }
};

// Инициализация Google Identity Services при входе в приложение
function initGoogleAuth() {
    const script = document.createElement('script');
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    accessToken = tokenResponse.access_token;
                    document.getElementById('auth-block').style.display = 'none';
                    document.getElementById('emails-block').style.display = 'block';
                    loadGmailData();
                }
            },
        });
        
        // Привязываем события к кнопкам Gmail после загрузки скрипта Google
        setupGmailButtons();
    };
    document.head.appendChild(script);
}

function setupGmailButtons() {
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');

    if (loginBtn) {
        loginBtn.onclick = () => {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        };
    }
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (accessToken) {
                google.accounts.oauth2.revoke(accessToken, () => {
                    accessToken = null;
                    document.getElementById('auth-block').style.display = 'block';
                    document.getElementById('emails-block').style.display = 'none';
                    document.getElementById('emails-list').innerHTML = '';
                });
            }
        };
    }
}

// Запрос данных из Gmail API
async function loadGmailData() {
    try {
        // Получаем email профиля
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const profile = await profileRes.json();
        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) userEmailEl.textContent = profile.emailAddress;

        // Получаем список из 5 последних писем
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        const container = document.getElementById('emails-list');
        if (!container) return;
        container.innerHTML = '';

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Входящих писем не найдено.</p>';
            return;
        }

        // Загружаем детали по каждому письму
        for (let msg of data.messages) {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const detail = await detailRes.json();
            const headers = detail.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'Без темы';
            const from = headers.find(h => h.name === 'From')?.value || 'Неизвестный отправитель';

            const card = document.createElement('div');
            card.style.cssText = 'padding: 15px; border: 1px solid var(--border-color); margin-bottom: 10px; border-radius: 8px; background: rgba(255,255,255,0.02); text-align: left;';
            card.innerHTML = `
                <div style="color: var(--accent-color); font-weight: bold; font-size: 13px;">${from.split('<')[0]}</div>
                <div style="font-weight: 600; margin: 4px 0; color: var(--text-color);">${subject}</div>
                <div style="font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${detail.snippet || ''}</div>
            `;
            container.appendChild(card);
        }
    } catch (err) {
        console.error('Ошибка Gmail API:', err);
        const container = document.getElementById('emails-list');
        if (container) container.innerHTML = '<p style="color:red; text-align:center;">Не удалось загрузить почту.</p>';
    }
}

function showAuthPage(page) {
    document.getElementById('ageError').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('codeResult').style.display = 'none';
    if(page === 'login') {
        document.getElementById('registerWindow').style.display = 'none';
        document.getElementById('loginWindow').style.display = 'block';
    } else {
        document.getElementById('registerWindow').style.display = 'block';
        document.getElementById('loginWindow').style.display = 'none';
    }
}

function generateUniqueToken(prefix = 'ID') {
    return prefix + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Registration
document.getElementById('regForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const firstname = document.getElementById('regFirstname').value;
    const lastname = document.getElementById('regLastname').value;
    const age = parseInt(document.getElementById('regAge').value);
    const email = document.getElementById('regEmail').value;

    if (age < 7) {
        document.getElementById('ageError').style.display = 'block';
        return;
    }

    const accessCode = generateUniqueToken('ID');
    const userData = { firstname, lastname, age, email, contacts: [], registeredNumbers: [], companyId: null, companyRole: null, documents: [] };
    localStorage.setItem('user_' + accessCode, JSON.stringify(userData));

    const codeResult = document.getElementById('codeResult');
    codeResult.innerHTML = `Success!<br>Your secret code: <span style="user-select:all; color:blue;">${accessCode}</span><br><small>Copy it to log in next time.</small>`;
    codeResult.style.display = 'block';
    this.reset();
});

// Login
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const code = document.getElementById('loginCode').value.trim();
    if (localStorage.getItem('user_' + code)) {
        sessionStorage.setItem('currentClientCode', code);
        loginToApp(code);
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
});

function loginToApp(code) {
    currentAccountCode = code;
    document.getElementById('registerWindow').style.display = 'none';
    document.getElementById('loginWindow').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    
    const userData = JSON.parse(localStorage.getItem('user_' + code));
    document.getElementById('editFirstname').value = userData.firstname;
    document.getElementById('editLastname').value = userData.lastname;
    document.getElementById('editEmail').value = userData.email;

    if(!userData.documents) userData.documents = [];
    localStorage.setItem('user_' + code, JSON.stringify(userData));

    renderContacts();
    updateMyNumbersDropdown();
    renderCompanyView();
    renderDocuments();

    // Инициализируем вход через Google, как только пользователь попал в приложение
    initGoogleAuth();

    const firstBtn = document.querySelector('.nav-btn');
    switchPage('page-phone', firstBtn);
}

function switchPage(pageId, buttonElement) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    buttonElement.classList.add('active');
}

// Global modal handlers
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
// Explicitly declare globally for inline html call triggers
window.openModal = openModal;
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.closeModal = closeModal;

/* --- 2.1 CONTACTS --- */
function renderContacts() {
    const container = document.getElementById('contactsContainer'); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); container.innerHTML = '';
    if (!userData.contacts || userData.contacts.length === 0) { container.innerHTML = '<div class="empty-placeholder">No contacts</div>'; return; }
    userData.contacts.forEach(c => {
        const card = document.createElement('div'); card.className = 'item-card';
        card.innerHTML = `<h4>${c.firstname} ${c.lastname}</h4><p>Phone: <b>${c.code} ${c.number}</b></p>`; container.appendChild(card);
    });
}
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault(); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    userData.contacts.push({ firstname: document.getElementById('conFirstname').value, lastname: document.getElementById('conLastname').value, code: document.getElementById('conCode').value, number: document.getElementById('conNumber').value });
    localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userData)); closeModal('contactModal'); this.reset(); renderContacts();
});

/* --- 2.2 CALLING HARDWARE TUNNEL --- */
function generateDailyNumbersPool() {
    const region = document.getElementById('regNumberRegion').value;
    const select = document.getElementById('regNumberPoolSelect'); select.innerHTML = '';
    const seed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    for (let i = 0; i < 4; i++) {
        let pseudoRandom = Math.abs(Math.sin(seed + i) * 10000000);
        let num7Digits = Math.floor(pseudoRandom).toString().padEnd(7, '7').substring(0,7);
        let opt = document.createElement('option'); opt.value = `${region} ${num7Digits}`; opt.textContent = `${region} ${num7Digits}`; select.appendChild(opt);
    }
}
window.generateDailyNumbersPool = generateDailyNumbersPool;

function openNumberRegModal() { generateDailyNumbersPool(); openModal('numberRegModal'); }
window.openNumberRegModal = openNumberRegModal;

function saveRegisteredNumber() {
    const selectedNum = document.getElementById('regNumberPoolSelect').value; const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    if(!userData.registeredNumbers.includes(selectedNum)) { userData.registeredNumbers.push(selectedNum); localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userData)); updateMyNumbersDropdown(); }
    closeModal('numberRegModal');
}
window.saveRegisteredNumber = saveRegisteredNumber;

function updateMyNumbersDropdown() {
    const select = document.getElementById('myNumbersSelect'); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); select.innerHTML = '';
    if(!userData.registeredNumbers || userData.registeredNumbers.length === 0) { select.innerHTML = '<option value="">No active number</option>'; return; }
    userData.registeredNumbers.forEach(num => { let opt = document.createElement('option'); opt.value = num; opt.textContent = num; select.appendChild(opt); });
}
function makeCall() {
    const activeLine = document.getElementById('myNumbersSelect').value;
    if (!activeLine) { alert('Call not processed. You must register and select an active virtual number first!'); return; }
    alert(`Dialing from line [${activeLine}] to [${document.getElementById('dialNumberInput').value}]...\nConnection active!`);
}
window.makeCall = makeCall;

/* --- 3. COMPANY NETWORK --- */
function renderCompanyView() {
    const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    if (!userData.companyId) {
        document.getElementById('companyStateUnregistered').style.display = 'block'; document.getElementById('companyStateDashboard').style.display = 'none';
    } else {
        document.getElementById('companyStateUnregistered').style.display = 'none'; document.getElementById('companyStateDashboard').style.display = 'flex';
        const globalCompanyData = JSON.parse(localStorage.getItem('company_' + userData.companyId)); if(!globalCompanyData) return;
        document.getElementById('compDashboardName').textContent = globalCompanyData.name;
        document.getElementById('compDashboardAddress').textContent = globalCompanyData.address || 'No Address Provided';
        document.getElementById('compDashboardBio').textContent = globalCompanyData.bio;
        
        // Логика управления отображением логотипа компании вместо смайлика
        const logoImg = document.getElementById('compDashboardLogoImg');
        const logoPlaceholder = document.getElementById('compDashboardLogoPlaceholder');
        if (globalCompanyData.logo) {
            logoImg.src = globalCompanyData.logo;
            logoImg.style.display = 'block';
            logoPlaceholder.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoPlaceholder.style.display = 'block';
        }

        if (userData.companyRole === 'Administrator') { document.getElementById('compSettingsBtn').style.display = 'block'; } else {
            const matchedRoleObj = globalCompanyData.roles.find(r => r.title === userData.companyRole);
            if(matchedRoleObj && (matchedRoleObj.editProfile || matchedRoleObj.editRoles || matchedRoleObj.addWidgets)) document.getElementById('compSettingsBtn').style.display = 'block'; else document.getElementById('compSettingsBtn').style.display = 'none';
        }
        const membersContainer = document.getElementById('companyMembersContainer'); membersContainer.innerHTML = '';
        globalCompanyData.members.forEach(m => { const card = document.createElement('div'); card.className = 'item-card'; card.innerHTML = `<h4>${m.name}</h4><p>Role Position: <b style="color:var(--btn-bg);">${m.role}</b></p>`; membersContainer.appendChild(card); });
    }
}
document.getElementById('companyCreateForm').addEventListener('submit', function(e) {
    e.preventDefault(); const compId = generateUniqueToken('COMP'); const userObj = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    const companyPayload = { id: compId, name: document.getElementById('creationCompName').value, address: document.getElementById('creationCompAddress').value, bio: document.getElementById('creationCompBio').value, logo: document.getElementById('creationCompLogo').value, creatorCode: currentAccountCode, roles: [], members: [{ userCode: currentAccountCode, name: `${userObj.firstname} ${userObj.lastname}`, role: 'Administrator' }] };
    localStorage.setItem('company_' + compId, JSON.stringify(companyPayload)); userObj.companyId = compId; userObj.companyRole = 'Administrator'; localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userObj));
    closeModal('companyCreateModal'); this.reset(); renderCompanyView();
});
document.getElementById('companyJoinForm').addEventListener('submit', function(e) {
    e.preventDefault(); const inputtedToken = document.getElementById('joinCompCode').value.trim(); let foundCompany = null;
    for(let key in localStorage) { if(key.startsWith('company_')) { let cData = JSON.parse(localStorage.getItem(key)); if(cData.activeInviteTokens && cData.activeInviteTokens.includes(inputtedToken)) { foundCompany = cData; break; } } }
    if(!foundCompany) { alert('Invalid Workspace Token!'); return; }
    const userObj = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); foundCompany.members.push({ userCode: currentAccountCode, name: `${userObj.firstname} ${userObj.lastname}`, role: 'Employee' });
    localStorage.setItem('company_' + foundCompany.id, JSON.stringify(foundCompany)); userObj.companyId = foundCompany.id; userObj.companyRole = 'Employee'; localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userObj));
    closeModal('companyJoinForm'); this.reset(); renderCompanyView();
});
function openCompanySettingsModal() {
    const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); const companyData = JSON.parse(localStorage.getItem('company_' + userData.companyId));
    document.getElementById('setCompName').value = companyData.name; document.getElementById('setCompAddress').value = companyData.address; document.getElementById('setCompBio').value = companyData.bio; document.getElementById('setCompLogo').value = companyData.logo;
    document.getElementById('inviteCodeDisplay').style.display = 'none'; openModal('companySettingsModal');
}
window.openCompanySettingsModal = openCompanySettingsModal;

function saveCompanyProfileChanges() {
    const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); const companyData = JSON.parse(localStorage.getItem('company_' + userData.companyId));
    companyData.name = document.getElementById('setCompName').value; companyData.address = document.getElementById('setCompAddress').value; companyData.bio = document.getElementById('setCompBio').value; companyData.logo = document.getElementById('setCompLogo').value;
    localStorage.setItem('company_' + companyData.id, JSON.stringify(companyData)); renderCompanyView(); alert('Profile updated!');
}
window.saveCompanyProfileChanges = saveCompanyProfileChanges;

function generateCompanyInviteToken() {
    const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); const companyData = JSON.parse(localStorage.getItem('company_' + userData.companyId));
    if(!companyData.activeInviteTokens) companyData.activeInviteTokens = []; const generatedToken = generateUniqueToken('TOKEN');
    companyData.activeInviteTokens.push(generatedToken); localStorage.setItem('company_' + companyData.id, JSON.stringify(companyData));
    const display = document.getElementById('inviteCodeDisplay'); display.textContent = generatedToken; display.style.display = 'block';
}
window.generateCompanyInviteToken = generateCompanyInviteToken;

function createCustomRole() {
    const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); const companyData = JSON.parse(localStorage.getItem('company_' + userData.companyId));
    const title = document.getElementById('newRoleTitle').value.trim(); if(!title) return;
    companyData.roles.push({ title: title, editProfile: document.getElementById('permEditProfile').checked, editRoles: document.getElementById('permEditRoles').checked, addWidgets: document.getElementById('permAddWidgets').checked });
    localStorage.setItem('company_' + companyData.id, JSON.stringify(companyData)); document.getElementById('newRoleTitle').value = ''; alert(`Role ${title} Created.`);
}
window.createCustomRole = createCustomRole;

/* --- 4. DOCUMENTS ARCHITECTURE --- */
function renderDocuments() {
    const container = document.getElementById('documentsContainer'); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode)); container.innerHTML = '';
    if (!userData.documents || userData.documents.length === 0) { container.innerHTML = '<div class="empty-placeholder">No documents available</div>'; return; }
    userData.documents.forEach(doc => {
        const card = document.createElement('div'); card.className = 'item-card';
        let styleInline = '';
        if(doc.style === 'bold') styleInline = 'font-weight: bold;'; if(doc.style === 'italic') styleInline = 'font-style: italic;'; if(doc.style === 'underline') styleInline = 'text-decoration: underline;';
        card.innerHTML = `<h4>${doc.title}</h4><p style="${styleInline}">${doc.content}</p>`; container.appendChild(card);
    });
}
document.getElementById('documentForm').addEventListener('submit', function(e) {
    e.preventDefault(); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    const newDocPayload = { title: document.getElementById('docTitle').value, style: document.getElementById('docFontWeight').value, content: document.getElementById('docContent').value };
    if(!userData.documents) userData.documents = []; userData.documents.push(newDocPayload); localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userData));
    closeModal('documentModal'); this.reset(); renderDocuments();
});

/* --- GLOBAL CONTROL SYSTEM --- */
document.getElementById('editProfileForm').addEventListener('submit', function(e) {
    e.preventDefault(); const userData = JSON.parse(localStorage.getItem('user_' + currentAccountCode));
    userData.firstname = document.getElementById('editFirstname').value; userData.lastname = document.getElementById('editLastname').value; userData.email = document.getElementById('editEmail').value; localStorage.setItem('user_' + currentAccountCode, JSON.stringify(userData)); alert('Profile updated!');
});
function setTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('site-theme', themeName); }
window.setTheme = setTheme;

function logout() { sessionStorage.removeItem('currentClientCode'); currentAccountCode = null; accessToken = null; document.getElementById('mainApp').style.display = 'none'; document.getElementById('loginForm').reset(); showAuthPage('register'); }
window.logout = logout;

function showAuthPageGlobal(page) { showAuthPage(page); }
window.showAuthPage = showAuthPageGlobal;

function switchPageGlobal(pageId, btn) { switchPage(pageId, btn); }
window.switchPage = switchPageGlobal;
