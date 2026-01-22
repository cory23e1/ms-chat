$(document).ready(function() {
// Конфигурация GitHub
const CONFIG = {
    githubToken: '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',
    repoOwner: 'cory23e1',
    repoName: 'ms-chat',
    filePath: 'data/chat.json',
    statusFilePath: 'data/status.json',
    usersFilePath: 'data/users.json', // НОВЫЙ файл для хранения данных пользователей
    apiBase: 'https://api.github.com',
    updateInterval: 3000,
    maxMessages: 300,
    maxFileSize: 5 * 1024 * 1024,
    sessionId: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
};

// Обновленное состояние
const state = {
    messages: [],
    messagesMap: new Map(),
    currentUser: localStorage.getItem('chat_user') || 'Гость',
    userAvatar: localStorage.getItem('chat_avatar') || 'https://ui-avatars.com/api/?name=Гость&background=6a11cb&color=fff&size=200',
    userData: { // НОВЫЙ объект для хранения данных пользователя
        avatar: localStorage.getItem('chat_avatar') || 'https://ui-avatars.com/api/?name=Гость&background=6a11cb&color=fff&size=200',
        lastOnline: Date.now(),
        status: 'online'
    },
    attachments: [],
    usersStatus: new Map(),
    usersData: new Map(), // НОВЫЙ Map для хранения данных всех пользователей
    isLoading: false,
    emojiPickerVisible: false,
    replyingTo: null,
    isOnline: true,
    activityTimer: null,
    statusUpdateTimer: null
};

// Эмодзи
const emojis = ['😀', '😊', '😂', '🥰', '😎', '🤔', '👏', '🎉', '🚀', '💯', 
               '❤️', '🔥', '⭐', '👍', '👎', '🙏', '✌️', '🤝', '👀', '🙈'];

// Иконки для типов файлов
const fileIcons = {
    'pdf': { icon: 'fas fa-file-pdf', color: '#e74c3c' },
    'txt': { icon: 'fas fa-file-alt', color: '#3498db' },
    'zip': { icon: 'fas fa-file-archive', color: '#f39c12' },
    'rar': { icon: 'fas fa-file-archive', color: '#d35400' },
    'doc': { icon: 'fas fa-file-word', color: '#2c3e50' },
    'docx': { icon: 'fas fa-file-word', color: '#2c3e50' }
};

// Инициализация
// Обновленная функция init
function init() {
    $('#userName').text(state.currentUser);
    $('#userAvatar').attr('src', state.userAvatar);
    
    if (CONFIG.githubToken.includes('ваш_токен')) {
        showError('Настройте GitHub токен в коде!');
        return;
    }
    
    setupEventListeners();
    setupActivityTracking(); // НОВОЕ: отслеживание активности
    initEmojiPicker();
    
    // Устанавливаем статус онлайн при загрузке
    setUserStatus('online');
    
    loadMessages();
    loadUsersData(); // НОВОЕ: загружаем данные пользователей
    loadUserStatuses();
    startPolling();
    updateConnectionStatus('Подключение...');
    
    // Запрос имени при первом входе
    setTimeout(() => {
        if (state.currentUser === 'Гость') {
            askForName();
        }
    }, 500);
    
    // Обработка закрытия страницы
    $(window).on('beforeunload', function() {
        // Устанавливаем статус оффлайн при закрытии
        setUserStatus('offline');
        // Очищаем таймеры
        if (state.activityTimer) clearInterval(state.activityTimer);
        if (state.statusUpdateTimer) clearInterval(state.statusUpdateTimer);
    });
    
    // Периодическая проверка активности
    state.statusUpdateTimer = setInterval(() => {
        updateOnlineUsersList();
    }, 10000);
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Имя пользователя
    $('#userName').on('click', askForName);
    
    // Аватарка
    $('#avatarInput').on('change', function(e) {
        handleAvatarUpload(e);
    });
    
    // Отправка сообщения
    $('#sendButton').on('click', sendMessage);
    
    // Enter для отправки
    $('#messageInput').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Автовысота textarea
    $('#messageInput').on('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Файлы
    $('#fileInput').on('change', function(e) {
        handleFileSelect(e);
    });
    
    // Отмена ответа
    $('#cancelReply').on('click', function() {
        cancelReply();
    });
    
    // Прокрутка вниз
    $('#scrollDownBtn').on('click', scrollToBottom);
    
    // Наблюдатель за прокруткой
    $('#chatMessages').on('scroll', function() {
        const isBottom = $(this)[0].scrollHeight - $(this).scrollTop() - $(this).outerHeight() < 100;
        $('#scrollDownBtn').toggle(!isBottom);
    });
    
    // Закрытие эмодзи-пикера
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#emojiPicker, #emojiBtn').length && state.emojiPickerVisible) {
            $('#emojiPicker').hide();
            state.emojiPickerVisible = false;
        }
    });
    
    // Модальное окно для изображений
    $('.close-modal').on('click', function() {
        $('#imageModal').hide();
    });
    
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') {
            $('#imageModal').hide();
        }
    });
}

// Установка статуса пользователя

//новое
function updateUserActivity() {
    if (state.isOnline) {
        state.userData.lastOnline = Date.now();
        state.userData.status = 'online';
        // Сохраняем активность каждые 10 секунд
        if (!state.activityTimer) {
            state.activityTimer = setInterval(async () => {
                await saveUserStatusAndData();
            }, 10000);
        }
    }
}

// Отслеживание активности
function setupActivityTracking() {
    // Обновляем активность при любых действиях пользователя
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
        $(document).on(event, debounce(updateUserActivity, 1000));
    });
    
    // Обновляем статус при фокусе/разфокусе окна
    $(window).on('focus', () => {
        state.isOnline = true;
        updateUserActivity();
        setUserStatus('online');
    });
    
    $(window).on('blur', () => {
        // При потере фокуса не сразу переводим в оффлайн
        // Будем считать оффлайн только через 30 секунд неактивности
    });
}

// Функция для определения, онлайн ли пользователь
function isUserOnline(userData) {
    if (!userData || !userData.lastOnline) return false;
    const now = Date.now();
    // Считаем онлайн, если активность была менее 30 секунд назад
    return (now - userData.lastOnline < 30000);
}



// Обновленная функция установки статуса
async function setUserStatus(status) {
    try {
        state.isOnline = status === 'online';
        state.userData.status = status;
        state.userData.lastOnline = Date.now();
        
        // Обновляем локальные данные
        state.usersData.set(state.currentUser, {
            ...state.userData,
            avatar: state.userAvatar
        });
        
        // Обновляем UI
        updateUserStatusUI(status);
        
        // Сохраняем в GitHub
        await saveUserStatusAndData();
        
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
    }
}

async function saveUserStatusAndData() {
    try {
        // 1. Сохраняем данные пользователя
        await saveUserData();
        
        // 2. Сохраняем статусы
        await saveUserStatuses();
        
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
    }
}

async function saveUserData(maxRetries = 3) {
    try {
        const url = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.usersFilePath}`;
        
        let retryCount = 0;
        let success = false;
        let lastError = null;
        
        while (retryCount < maxRetries && !success) {
            try {
                // 1. Получаем текущие данные файла
                let sha = null;
                let usersData = {};
                
                const getResponse = await fetch(url, {
                    headers: {
                        'Authorization': `token ${CONFIG.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (getResponse.ok) {
                    const data = await getResponse.json();
                    sha = data.sha;
                    const content = decodeBase64(data.content);
                    usersData = JSON.parse(content || '{}');
                } else if (getResponse.status !== 404) {
                    // Если ошибка не "файл не найден", пробуем снова
                    retryCount++;
                    await delay(1000 * retryCount);
                    continue;
                }
                
                // 2. Обновляем данные текущего пользователя
                usersData[state.currentUser] = {
                    avatar: state.userAvatar,
                    lastUpdated: Date.now(),
                    name: state.currentUser
                };
                
                // 3. Сохраняем
                const jsonString = JSON.stringify(usersData, null, 2);
                const content = encodeBase64(jsonString);
                
                const putResponse = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${CONFIG.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Обновление данных пользователя: ${state.currentUser}`,
                        content: content,
                        sha: sha
                    })
                });
                
                if (putResponse.ok) {
                    success = true;
                    console.log('Данные пользователя успешно сохранены');
                } else if (putResponse.status === 409) {
                    // Конфликт - файл был изменен, нужно повторить
                    retryCount++;
                    console.log(`Конфликт при сохранении, повтор ${retryCount}/${maxRetries}`);
                    await delay(1000 * retryCount);
                } else {
                    const error = await putResponse.json();
                    throw new Error(error.message || `Ошибка HTTP ${putResponse.status}`);
                }
                
            } catch (error) {
                lastError = error;
                retryCount++;
                await delay(1000 * retryCount);
            }
        }
        
        if (!success) {
            console.error('Не удалось сохранить данные пользователя после нескольких попыток:', lastError);
            // Сохраняем локально для восстановления при следующей загрузке
            localStorage.setItem('pending_user_update', JSON.stringify({
                username: state.currentUser,
                avatar: state.userAvatar,
                timestamp: Date.now()
            }));
        }
        
    } catch (error) {
        console.error('Ошибка сохранения данных пользователя:', error);
    }
}

// Обновленная функция загрузки данных пользователей с обработкой устаревших данных
async function loadUsersData() {
    try {
        const url = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.usersFilePath}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${CONFIG.githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            console.log('Файл данных пользователей не найден, будет создан при первом сохранении');
            return;
        }
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const content = decodeBase64(data.content);
        const usersData = JSON.parse(content || '{}');
        
        const now = Date.now();
        
        // Загружаем данные пользователей
        Object.entries(usersData).forEach(([username, userData]) => {
            // Проверяем, не устарели ли данные (старше 1 дня)
            if (userData.lastUpdated && (now - userData.lastUpdated < 86400000)) {
                state.usersData.set(username, userData);
            }
        });
        
        // Проверяем, есть ли локальные обновления, которые не удалось сохранить
        const pendingUpdate = localStorage.getItem('pending_user_update');
        if (pendingUpdate) {
            try {
                const updateData = JSON.parse(pendingUpdate);
                if (updateData.username === state.currentUser && 
                    updateData.timestamp > (usersData[state.currentUser]?.lastUpdated || 0)) {
                    
                    // Применяем локальные обновления
                    state.usersData.set(state.currentUser, {
                        avatar: updateData.avatar,
                        lastUpdated: updateData.timestamp,
                        name: state.currentUser
                    });
                    
                    // Пробуем сохранить снова
                    setTimeout(() => saveUserData(), 2000);
                }
                
                // Очищаем локальное хранилище
                localStorage.removeItem('pending_user_update');
            } catch (e) {
                console.error('Ошибка обработки локальных обновлений:', e);
            }
        }
        
        updateOnlineUsersList();
        
    } catch (error) {
        console.error('Ошибка загрузки данных пользователей:', error);
    }
}


function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '(только что)';
    if (diff < 3600000) return `(${Math.floor(diff / 60000)} мин назад)`;
    if (diff < 86400000) return `(${Math.floor(diff / 3600000)} ч назад)`;
    return `(${Math.floor(diff / 86400000)} дн назад)`;
}

// Функция debounce для оптимизации
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
//новое
            
// Обновление UI статуса
function updateUserStatusUI(status) {
    const userStatus = $('#userStatus');
    const statusDot = $('#statusDot');
    const statusText = $('#statusText');
    
    if (status === 'online') {
        userStatus.removeClass('offline').addClass('online');
        statusDot.removeClass('offline').addClass('online');
        statusText.text('В сети');
    } else {
        userStatus.removeClass('online').addClass('offline');
        statusDot.removeClass('online').addClass('offline');
        statusText.text('Не в сети');
    }
}

// Сохранение статусов пользователей
async function saveUserStatuses(maxRetries = 3) {
    try {
        const getUrl = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.statusFilePath}`;
        
        let retryCount = 0;
        let success = false;
        
        while (retryCount < maxRetries && !success) {
            try {
                // 1. Получаем текущие статусы
                let sha = null;
                let statuses = {};
                
                const getResponse = await fetch(getUrl, {
                    headers: {
                        'Authorization': `token ${CONFIG.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (getResponse.ok) {
                    const data = await getResponse.json();
                    sha = data.sha;
                    const content = decodeBase64(data.content);
                    statuses = JSON.parse(content || '{}');
                } else if (getResponse.status !== 404) {
                    retryCount++;
                    await delay(1000 * retryCount);
                    continue;
                }
                
                // 2. Фильтруем устаревшие статусы (старше 1 часа)
                const now = Date.now();
                const updatedStatuses = { ...statuses };
                
                // Обновляем статус текущего пользователя
                updatedStatuses[state.currentUser] = {
                    status: state.isOnline ? 'online' : 'offline',
                    lastSeen: now,
                    sessionId: CONFIG.sessionId,
                    avatar: state.userAvatar // Добавляем аватар в статус
                };
                
                // Удаляем устаревшие статусы других пользователей
                Object.keys(updatedStatuses).forEach(username => {
                    if (username !== state.currentUser) {
                        const userStatus = updatedStatuses[username];
                        if (now - userStatus.lastSeen > 3600000) { // 1 час
                            delete updatedStatuses[username];
                        }
                    }
                });
                
                // 3. Сохраняем
                const jsonString = JSON.stringify(updatedStatuses, null, 2);
                const content = encodeBase64(jsonString);
                
                const putResponse = await fetch(getUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${CONFIG.githubToken}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: 'Обновление статусов',
                        content: content,
                        sha: sha
                    })
                });
                
                if (putResponse.ok) {
                    success = true;
                    console.log('Статусы успешно сохранены');
                } else if (putResponse.status === 409) {
                    retryCount++;
                    console.log(`Конфликт при сохранении статусов, повтор ${retryCount}/${maxRetries}`);
                    await delay(1000 * retryCount);
                } else {
                    const error = await putResponse.json();
                    throw new Error(error.message || `Ошибка HTTP ${putResponse.status}`);
                }
                
            } catch (error) {
                console.error(`Ошибка при попытке ${retryCount + 1}:`, error);
                retryCount++;
                await delay(1000 * retryCount);
            }
        }
        
        if (!success) {
            console.error('Не удалось сохранить статусы после нескольких попыток');
        }
        
    } catch (error) {
        console.error('Ошибка сохранения статусов:', error);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Обновленная функция сохранения статуса и данных
async function saveUserStatusAndData() {
    try {
        // Сохраняем статус и данные параллельно
        await Promise.allSettled([
            saveUserStatuses(),
            saveUserData()
        ]);
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
    }
}

// Загрузка статусов пользователей
async function loadUserStatuses() {
    try {
        const url = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.statusFilePath}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${CONFIG.githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            return;
        }
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const content = decodeBase64(data.content);
        const statuses = JSON.parse(content || '{}');
        
        const now = Date.now();
        
        // Обновляем статусы и данные
        Object.entries(statuses).forEach(([username, userStatus]) => {
            state.usersStatus.set(username, userStatus);
            
            // Обновляем данные пользователя
            const userData = state.usersData.get(username) || {};
            if (userStatus.avatar) {
                userData.avatar = userStatus.avatar;
            }
            userData.lastOnline = userStatus.lastOnline || userStatus.lastSeen;
            userData.status = isUserOnline(userData) ? 'online' : 'offline';
            state.usersData.set(username, userData);
        });
        
        updateOnlineUsersList();
        
    } catch (error) {
        console.error('Ошибка загрузки статусов:', error);
    }
}

// Обновление списка пользователей
// Обновленная функция updateOnlineUsersList
function updateOnlineUsersList() {
    const userList = $('#userList');
    const now = Date.now();
    
    // Собираем уникальных пользователей
    const usersMap = new Map();
    
    // Добавляем пользователей из сообщений
    state.messages.forEach(msg => {
        if (!usersMap.has(msg.user)) {
            const userData = state.usersData.get(msg.user);
            const isOnline = userData ? isUserOnline(userData) : false;
            const avatar = userData?.avatar || 
                         msg.userAvatar ||
                         `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.user)}&background=6a11cb&color=fff&size=100`;
            
            usersMap.set(msg.user, {
                name: msg.user,
                avatar: avatar,
                isOnline: isOnline,
                lastOnline: userData?.lastOnline || msg.timestamp || 0
            });
        }
    });
    
    // Добавляем текущего пользователя (если его еще нет)
    if (!usersMap.has(state.currentUser)) {
        usersMap.set(state.currentUser, {
            name: state.currentUser,
            avatar: state.userAvatar,
            isOnline: true,
            lastOnline: now
        });
    }
    
    // Добавляем пользователей из данных (например, тех кто есть в usersData, но еще не писал сообщения)
    state.usersData.forEach((userData, username) => {
        if (!usersMap.has(username)) {
            const isOnline = isUserOnline(userData);
            usersMap.set(username, {
                name: username,
                avatar: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=6a11cb&color=fff&size=100`,
                isOnline: isOnline,
                lastOnline: userData.lastOnline || userData.lastUpdated || 0
            });
        }
    });
    
    if (usersMap.size === 0) {
        userList.html('<div class="loading">Нет участников</div>');
        return;
    }
    
    // Сортируем
    const sortedUsers = Array.from(usersMap.values()).sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return b.lastOnline - a.lastOnline;
    });
    
    let html = '';
    sortedUsers.forEach(user => {
        const isCurrent = user.name === state.currentUser;
        const statusColor = user.isOnline ? '#2ecc71' : '#6c757d';
        const statusText = user.isOnline ? 'В сети' : 'Не в сети';
        const timeAgo = user.isOnline ? '' : formatTimeAgo(user.lastOnline);
        
        html += `
            <div class="user-list-item">
                <img src="${user.avatar}" class="user-list-avatar" alt="${user.name}">
                <div class="user-list-info">
                    <div class="user-list-name">${user.name} ${isCurrent ? '(Вы)' : ''}</div>
                    <div class="user-list-status">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
                        ${statusText} ${timeAgo}
                    </div>
                </div>
            </div>
        `;
    });
    
    userList.html(html);
}

// Загрузка аватарки
async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showError('Выберите изображение!');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        showError('Изображение должно быть меньше 2MB');
        return;
    }
    
    try {
        // Показываем индикатор загрузки
        showNotification('🔄 Обновление аватара...');
        
        const compressedData = await compressImage(file, 300, 300, 0.8);
        
        // Обновляем локально
        state.userAvatar = compressedData;
        state.userData.avatar = compressedData;
        
        // Сохраняем в localStorage
        localStorage.setItem('chat_avatar', compressedData);
        
        // Обновляем UI
        $('#userAvatar').attr('src', compressedData);
        
        // ОБНОВЛЯЕМ ВСЕ СООБЩЕНИЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
        updateAllMessagesWithNewAvatar();
        
        // Обновляем данные пользователя в локальном хранилище
        state.usersData.set(state.currentUser, {
            ...state.userData,
            avatar: compressedData,
            lastUpdated: Date.now()
        });
        
        // Обновляем список пользователей
        updateOnlineUsersList();
        
        // Сохраняем в GitHub (с повторами при конфликтах)
        await saveUserData();
        
        showNotification('✅ Аватар обновлен!');
        $('#avatarInput').val('');
        
    } catch (error) {
        console.error('Ошибка обновления аватара:', error);
        showError('⚠️ Ошибка обновления аватара');
    }
}

function updateAllMessagesWithNewAvatar() {
    // Обновляем аватарки во всех сообщениях текущего пользователя
    $(`.message[data-user="${state.currentUser}"] .message-avatar`).each(function() {
        $(this).attr('src', state.userAvatar);
    });
    
    // Обновляем в списке пользователей
    $(`.user-list-name:contains("${state.currentUser}")`).each(function() {
        const listItem = $(this).closest('.user-list-item');
        listItem.find('.user-list-avatar').attr('src', state.userAvatar);
    });
    
    // Обновляем в статус-баре и профиле
    $('#userAvatar').attr('src', state.userAvatar);
}

// Сжатие изображения
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const compressedData = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedData);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Запрос имени
function askForName() {
    const newName = prompt('Введите ваше имя:', state.currentUser);
    if (newName && newName.trim()) {
        state.currentUser = newName.trim();
        localStorage.setItem('chat_user', state.currentUser);
        $('#userName').text(state.currentUser);
        
        if (state.userAvatar.includes('ui-avatars.com')) {
            state.userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.currentUser)}&background=6a11cb&color=fff&size=200`;
            $('#userAvatar').attr('src', state.userAvatar);
        }
        
        showNotification(`Привет, ${state.currentUser}!`);
        setUserStatus('online');
    }
}

// Инициализация эмодзи-пикера
function initEmojiPicker() {
    const picker = $('#emojiPicker');
    
    emojis.forEach(emoji => {
        const span = $('<span class="emoji-item"></span>').text(emoji);
        span.on('click', function() {
            const input = $('#messageInput');
            const cursorPos = input[0].selectionStart;
            const text = input.val();
            input.val(text.substring(0, cursorPos) + emoji + text.substring(cursorPos));
            input.focus();
            input[0].selectionStart = input[0].selectionEnd = cursorPos + emoji.length;
            picker.hide();
            state.emojiPickerVisible = false;
        });
        picker.append(span);
    });
    
    $('#emojiBtn').on('click', function(e) {
        e.stopPropagation();
        state.emojiPickerVisible = !state.emojiPickerVisible;
        picker.toggle(state.emojiPickerVisible);
    });
}

// Обработка выбора файлов
function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const previewContainer = $('#previewContainer');
    let validFilesCount = 0;
    
    Array.from(files).forEach(file => {
        if (file.size > CONFIG.maxFileSize) {
            showError(`Файл "${file.name}" слишком большой (макс. 5MB)`);
            return;
        }
        
        validFilesCount++;
        
        if (file.type.startsWith('image/')) {
            compressImage(file, 1600, 1600, 0.7)
                .then(compressedData => {
                    addAttachmentToState(file, compressedData);
                })
                .catch(error => {
                    console.error('Ошибка сжатия:', error);
                    readFileAsDataURL(file);
                });
        } else {
            readFileAsDataURL(file);
        }
    });
    
    if (validFilesCount > 0) {
        showNotification(`Добавлено файлов: ${validFilesCount}`);
    }
    
    $(e.target).val('');
}

// Чтение файла как DataURL
function readFileAsDataURL(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        addAttachmentToState(file, event.target.result);
    };
    reader.onerror = function() {
        showError(`Ошибка чтения файла: ${file.name}`);
    };
    reader.readAsDataURL(file);
}

// Добавление вложения в состояние
function addAttachmentToState(file, data) {
    const attachment = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: file.type,
        name: file.name,
        data: data,
        size: formatFileSize(file.size)
    };
    
    state.attachments.push(attachment);
    
    const previewItem = createPreviewItem(attachment);
    $('#previewContainer').append(previewItem).show();
}

// Создание превью элемента
function createPreviewItem(attachment) {
    const previewItem = $('<div class="preview-item"></div>');
    
    if (attachment.type.startsWith('image/')) {
        previewItem.append(`<img src="${attachment.data}" alt="${attachment.name}">`);
    } else if (attachment.type.startsWith('video/')) {
        previewItem.append(`<video src="${attachment.data}"></video>`);
    } else {
        const ext = attachment.name.split('.').pop().toLowerCase();
        const fileInfo = fileIcons[ext] || { icon: 'fas fa-file', color: '#6c757d' };
        
        previewItem.addClass('preview-file').html(`
            <div class="preview-file-icon" style="color: ${fileInfo.color}">
                <i class="${fileInfo.icon}"></i>
            </div>
            <div class="preview-file-name">${attachment.name}</div>
        `);
    }
    
    const removeBtn = $('<button class="remove-preview"><i class="fas fa-times"></i></button>');
    removeBtn.on('click', function() {
        const index = state.attachments.findIndex(a => a.id === attachment.id);
        if (index > -1) {
            state.attachments.splice(index, 1);
        }
        previewItem.remove();
        if (state.attachments.length === 0) {
            $('#previewContainer').hide();
        }
    });
    
    previewItem.append(removeBtn);
    return previewItem;
}

// Ответ на сообщение
function replyToMessage(message) {
    state.replyingTo = message;
    $('#replyContent').text(message.text.substring(0, 100) + (message.text.length > 100 ? '...' : ''));
    $('#replyPreview').show();
    $('#messageInput').focus();
}

// Отмена ответа
function cancelReply() {
    state.replyingTo = null;
    $('#replyPreview').hide();
}

// Загрузка сообщений
async function loadMessages() {
    if (state.isLoading) return;
    
    state.isLoading = true;
    try {
        const url = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.filePath}?t=${Date.now()}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${CONFIG.githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            $('#loadingMessages').hide();
            updateConnectionStatus('Чат пуст');
            return;
        }
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const content = decodeBase64(data.content);
        const messages = JSON.parse(content || '[]');
        
        // Обновляем пользователей
        updateOnlineUsersList();
        
        // Проверяем новые сообщения
        const lastMessages = messages.slice(-CONFIG.maxMessages);
        const newMessages = [];
        
        lastMessages.forEach(msg => {
            if (!state.messagesMap.has(msg.id)) {
                newMessages.push(msg);
                state.messagesMap.set(msg.id, msg);
            }
        });
        
        if (newMessages.length > 0) {
            state.messages = state.messages.concat(newMessages);
            
            if (state.messages.length > CONFIG.maxMessages) {
                state.messages = state.messages.slice(-CONFIG.maxMessages);
            }
            
            addNewMessages(newMessages);
            updateConnectionStatus(`Загружено: ${newMessages.length} новых`);
            
            if (newMessages.some(msg => msg.user !== state.currentUser)) {
                playNotificationSound();
            }
        }
        
        $('#loadingMessages').hide();
        updateStats();
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        if (state.messages.length === 0) {
            updateConnectionStatus('Ошибка подключения');
        }
    } finally {
        state.isLoading = false;
    }
}

// Добавление новых сообщений
function addNewMessages(newMessages) {
    const container = $('#chatMessages');
    const wasScrolledBottom = isScrolledToBottom();
    
    newMessages.forEach(msg => {
        const messageHtml = createMessageHtml(msg);
        container.append(messageHtml);
        
        const messageElement = container.children().last();
        messageElement.hide().fadeIn(300);
    });
    
    updateStats();
    
    if (wasScrolledBottom) {
        setTimeout(scrollToBottom, 100);
    }
}

// Создание HTML для сообщения с медиа
function createMessageHtml(msg) {
    const date = new Date(msg.timestamp);
    const timeStr = date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const isSelf = msg.user === state.currentUser;
    const messageClass = isSelf ? 'message self' : 'message';

    let userAvatar;

    const userData = state.usersData.get(msg.user);

    if (userData && userData.avatar) {
        userAvatar = userData.avatar;
    } else if (msg.userAvatar) {
        userAvatar = msg.userAvatar;
        // Сохраняем в usersData для будущего использования
        state.usersData.set(msg.user, {
            avatar: msg.userAvatar,
            lastUpdated: Date.now(),
            name: msg.user
        });
    } else {
        // Генерируем аватар по умолчанию
        userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.user)}&background=${isSelf ? '6a11cb' : '2c3e50'}&color=fff&size=100`;
    }

    if (msg.user && !state.usersData.has(msg.user)) {
        state.usersData.set(msg.user, {
            avatar: userAvatar,
            lastOnline: Date.now(),
            name: msg.user
        });
    }
    
    let content = '';
    
    // Добавляем ответ на сообщение
    if (msg.replyTo) {
        const repliedMessage = state.messagesMap.get(msg.replyTo);
        if (repliedMessage) {
            content += `
                <div class="message-reply" onclick="replyToMessageById('${msg.replyTo}')">
                    <button class="reply-close" onclick="event.stopPropagation();">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="reply-author">${repliedMessage.user}</div>
                    <div class="reply-text">${escapeHtml(repliedMessage.text).substring(0, 100)}${repliedMessage.text.length > 100 ? '...' : ''}</div>
                </div>
            `;
        }
    }
    
    content += `<div class="message-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`;
    
    // Добавляем вложения
    if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(attachment => {
            if (attachment.type.startsWith('image/')) {
                // Изображения показываем прямо в чате
                if (attachment.name.toLowerCase().endsWith('.gif')) {
                    // GIF
                    content += `
                        <div class="media-container">
                            <img src="${attachment.data}" class="chat-gif" alt="${attachment.name}" onclick="openImageModal('${attachment.data}')">
                        </div>
                    `;
                } else {
                    // Обычные изображения
                    content += `
                        <div class="media-container">
                            <img src="${attachment.data}" class="chat-image" alt="${attachment.name}" onclick="openImageModal('${attachment.data}')">
                        </div>
                    `;
                }
            } else if (attachment.type.startsWith('video/')) {
                // Видео
                content += `
                    <div class="media-container">
                        <video src="${attachment.data}" class="chat-video" controls></video>
                    </div>
                `;
            } else {
                // Документы показываем как файлы
                const ext = attachment.name.split('.').pop().toLowerCase();
                const fileInfo = fileIcons[ext] || { icon: 'fas fa-file', color: '#6c757d' };
                
                content += `
                    <div class="file-attachment">
                        <div class="file-icon" style="background: ${fileInfo.color}">
                            <i class="${fileInfo.icon}"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(attachment.name)}</div>
                            <div class="file-size">${attachment.size}</div>
                        </div>
                        <button class="file-download" onclick="downloadFile('${attachment.data}', '${attachment.name}')">
                            <i class="fas fa-download"></i> Скачать
                        </button>
                    </div>
                `;
            }
        });
    }
    
    // Кнопки действий
    content += `
        <div class="message-actions">
            <button class="message-action" onclick="replyToMessageById('${msg.id}')">
                <i class="fas fa-reply"></i> Ответить
            </button>
            <button class="message-action" onclick="copyMessage('${msg.id}')">
                <i class="fas fa-copy"></i> Копировать
            </button>
        </div>
    `;
    
    return `
        <div class="${messageClass}" data-id="${msg.id}" data-user="${msg.user}">
            <img src="${userAvatar}" class="message-avatar" alt="${msg.user}">
            <div class="message-content">
                <div class="message-header">
                    <div class="message-user">${msg.user}</div>
                    <div class="message-time">${timeStr}</div>
                </div>
                ${content}
            </div>
        </div>
    `;
}

// Отправка сообщения
async function sendMessage() {
    const text = $('#messageInput').val().trim();
    const attachments = [...state.attachments];
    
    if (!text && attachments.length === 0) return;
    
    // Создаем сообщение
    const message = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        user: state.currentUser,
        userAvatar: state.userAvatar,
        text: text,
        attachments: attachments,
        timestamp: new Date().toISOString()
    };
    
    if (state.replyingTo) {
        message.replyTo = state.replyingTo.id;
    }
    
    // Добавляем в интерфейс
    const messageHtml = createMessageHtml(message);
    $('#chatMessages').append(messageHtml);
    
    scrollToBottom();
    $('#messageInput').val('').css('height', 'auto');
    $('#previewContainer').empty().hide();
    $('#replyPreview').hide();
    state.attachments = [];
    state.replyingTo = null;
    
    // Добавляем в состояние
    state.messages.push(message);
    state.messagesMap.set(message.id, message);
    if (state.messages.length > CONFIG.maxMessages) {
        state.messages = state.messages.slice(-CONFIG.maxMessages);
    }
    
    updateStats();
    setUserStatus('online');
    updateOnlineUsersList();
    
    // Сохраняем в GitHub
    await saveMessages();
}

// Сохранение сообщений
async function saveMessages() {
    try {
        const getUrl = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.filePath}`;
        
        let sha = null;
        try {
            const response = await fetch(getUrl, {
                headers: {
                    'Authorization': `token ${CONFIG.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                sha = data.sha;
            }
        } catch (e) {}
        
        const messagesToSave = state.messages.slice(-100);
        const jsonString = JSON.stringify(messagesToSave, null, 2);
        
        if (jsonString.length > 1000000) {
            showError('Чат слишком большой. Сохранены только последние сообщения.');
            state.messages = state.messages.slice(-50);
            return;
        }
        
        const content = encodeBase64(jsonString);
        const commitMessage = sha ? 'Новое сообщение' : 'Создание чата';
        
        const putUrl = `${CONFIG.apiBase}/repos/${CONFIG.repoOwner}/${CONFIG.repoName}/contents/${CONFIG.filePath}`;
        
        const response = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${CONFIG.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: content,
                sha: sha
            })
        });
        
        if (response.ok) {
            updateConnectionStatus('Сохранено в GitHub');
            showNotification('✅ Сообщение отправлено');
        } else {
            const error = await response.json();
            throw new Error(error.message);
        }
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showError('⚠️ Ошибка, сообщение сохранено локально');
        localStorage.setItem('chat_messages', JSON.stringify(state.messages.slice(-50)));
    }
}

// Периодическое обновление
function startPolling() {
    setInterval(() => {
        loadMessages();
        loadUserStatuses();
    }, CONFIG.updateInterval);
}

// Вспомогательные функции
function scrollToBottom() {
    const container = $('#chatMessages');
    container.scrollTop(container[0].scrollHeight);
    $('#scrollDownBtn').hide();
}

function isScrolledToBottom() {
    const container = $('#chatMessages');
    return container[0].scrollHeight - container.scrollTop() - container.outerHeight() < 100;
}

// Обновленная функция обновления статистики
function updateStats() {
    $('#messageCount').text(`Сообщений: ${state.messages.length}`);
    const onlineCount = Array.from(state.usersData.values())
        .filter(user => isUserOnline(user)).length;
    $('#onlineCount').text(`Онлайн: ${onlineCount}`);
}

function updateConnectionStatus(text) {
    $('#connectionStatus').html(`<i class="fas fa-circle" style="color: #2ecc71;"></i> ${text}`);
}

function showNotification(text) {
    const notification = $('#notification');
    notification.text(text).fadeIn(300);
    setTimeout(() => notification.fadeOut(300), 3000);
}

function showError(text) {
    const error = $(`<div class="notification" style="background: #e74c3c;"></div>`)
        .text(text)
        .css({ display: 'block' });
    
    $('body').append(error);
    
    setTimeout(() => {
        error.fadeOut(300, () => error.remove());
    }, 5000);
}

function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        audio.volume = 0.2;
        audio.play().catch(() => {});
    } catch (e) {}
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function encodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str) {
    return decodeURIComponent(escape(atob(str)));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Глобальные функции для взаимодействия
window.downloadFile = function(base64Data, fileName) {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.replyToMessageById = function(messageId) {
    const message = state.messagesMap.get(messageId);
    if (message) {
        replyToMessage(message);
    }
};

window.copyMessage = function(messageId) {
    const message = state.messagesMap.get(messageId);
    if (message) {
        navigator.clipboard.writeText(message.text)
            .then(() => showNotification('Сообщение скопировано'))
            .catch(() => showError('Не удалось скопировать'));
    }
};

window.openImageModal = function(imageSrc) {
    $('#modalImage').attr('src', imageSrc);
    $('#imageModal').show();
};

// Запуск приложения
init();
});