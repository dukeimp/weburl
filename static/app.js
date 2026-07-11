// 搜索引擎配置
const SEARCH_ENGINES = {
    baidu: {
        url: 'https://www.baidu.com/s?wd='
    },
    google: {
        url: 'https://www.google.com/search?q='
    },
    bing: {
        url: 'https://www.bing.com/search?q='
    }
};

// 保存搜索引擎选择
function saveSearchEngine(engine) {
    localStorage.setItem('preferred_search_engine', engine);
}

// 获取保存的搜索引擎
function getSearchEngine() {
    return localStorage.getItem('preferred_search_engine') || 'baidu';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeBackgroundControls();
    loadBackgroundSettings();

    // 设置保存的搜索引擎
    const searchEngine = document.getElementById('searchEngine');
    searchEngine.value = getSearchEngine();

    // 站内实时模糊搜索
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterNavigation(searchInput.value.trim());
        });
    }
    
    // 检查并恢复登录状态
    checkLoginStatus();
    
    initializePage();
});

// 检查登录状态
async function checkLoginStatus() {
    const token = getToken();
    if (token) {
        try {
            const response = await fetch(`${API_BASE_URL}/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                isAdmin = true;
                isEditMode = false;  // 默认不进入编辑模式
                updateAdminButton();
            } else {
                // Token 无效，清除它
                setToken(null);
            }
        } catch (error) {
            console.error('验证token失败:', error);
            setToken(null);
        }
    }
}

async function initializePage() {
    await loadNavigation();
}

// 添加编辑模式状态
let isAdmin = false;
let isEditMode = false;
let currentGroups = [];
let currentLinks = [];
let draggedItem = null;
let currentBackgroundSettings = null;
let selectedBackgroundDataUrl = '';

function getBackgroundOpacityValue(value) {
    const opacity = parseInt(value, 10);
    if (Number.isNaN(opacity)) return 50;
    return Math.min(100, Math.max(0, opacity));
}

function updateBackgroundOpacityDisplay(value) {
    const opacity = getBackgroundOpacityValue(value);
    const display = document.getElementById('backgroundOpacityValue');
    if (display) {
        display.textContent = `${opacity}%`;
    }
}

function initializeBackgroundControls() {
    const opacityInput = document.getElementById('backgroundOpacity');
    const urlInput = document.getElementById('backgroundUrl');
    const modeInput = document.getElementById('backgroundMode');
    const fileInput = document.getElementById('backgroundFile');
    if (!opacityInput) return;

    opacityInput.addEventListener('input', () => {
        updateBackgroundOpacityDisplay(opacityInput.value);
        previewBackgroundSettings();
    });

    urlInput?.addEventListener('input', previewBackgroundSettings);
    modeInput?.addEventListener('change', previewBackgroundSettings);
    fileInput?.addEventListener('change', handleBackgroundFileChange);
}

async function loadBackgroundSettings() {
    try {
        currentBackgroundSettings = await fetchBackgroundSettings();
        applyBackgroundSettings(currentBackgroundSettings);
    } catch (error) {
        console.error('加载背景设置失败:', error);
        currentBackgroundSettings = null;
        applyBackgroundSettings(null);
    }
}

function getBackgroundImageValue(settings) {
    return settings?.image_data || '';
}

function clearBackgroundStyles() {
    document.body.classList.remove('has-custom-background');
    document.body.style.removeProperty('--custom-background-image');
    document.body.style.removeProperty('--custom-background-size');
    document.body.style.removeProperty('--custom-background-repeat');
    document.body.style.removeProperty('--custom-background-opacity');
}

function applyBackgroundSettings(settings) {
    const imageData = getBackgroundImageValue(settings);
    document.body.classList.toggle('has-custom-background', !!imageData);

    if (!imageData) {
        clearBackgroundStyles();
        return;
    }

    const mode = settings.mode || 'cover';
    const opacity = getBackgroundOpacityValue(settings.opacity ?? 50);
    document.body.style.setProperty('--custom-background-image', `url("${imageData.replace(/"/g, '\\"')}")`);
    document.body.style.setProperty('--custom-background-size', mode === 'repeat' ? '360px auto' : mode);
    document.body.style.setProperty('--custom-background-repeat', mode === 'repeat' ? 'repeat' : 'no-repeat');
    document.body.style.setProperty('--custom-background-opacity', opacity / 100);
}

function previewBackgroundSettings() {
    const url = document.getElementById('backgroundUrl')?.value.trim();
    const mode = document.getElementById('backgroundMode')?.value || 'cover';
    const opacity = getBackgroundOpacityValue(document.getElementById('backgroundOpacity')?.value ?? 50);
    const previewImage = selectedBackgroundDataUrl || url;

    if (!previewImage) {
        clearBackgroundStyles();
        return;
    }

    document.body.classList.add('has-custom-background');
    document.body.style.setProperty('--custom-background-image', `url("${previewImage.replace(/"/g, '\\"')}")`);
    document.body.style.setProperty('--custom-background-size', mode === 'repeat' ? '360px auto' : mode);
    document.body.style.setProperty('--custom-background-repeat', mode === 'repeat' ? 'repeat' : 'no-repeat');
    document.body.style.setProperty('--custom-background-opacity', opacity / 100);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取背景图片失败'));
        reader.readAsDataURL(file);
    });
}

async function handleBackgroundFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
        selectedBackgroundDataUrl = '';
        previewBackgroundSettings();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        event.target.value = '';
        return;
    }

    if (file.size > 4 * 1024 * 1024) {
        showToast('背景图片不能超过 4MB', 'error');
        event.target.value = '';
        return;
    }

    try {
        selectedBackgroundDataUrl = await readFileAsDataUrl(file);
        document.getElementById('backgroundUrl').value = '';
        previewBackgroundSettings();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// 更新管理员按钮状态
function updateAdminButton() {
    const adminButton = document.getElementById('adminButton');
    if (isAdmin) {
        if (isEditMode) {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="exitEditMode()">
                    <i class="fas fa-times"></i> 退出编辑
                </button>
            `;
        } else {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="enterEditMode()">
                    <i class="fas fa-edit"></i> 进行编辑
                </button>
            `;
        }
    } else {
        adminButton.innerHTML = `
            <button class="admin-button" onclick="openAdminModal()">
                <i class="fas fa-user-lock"></i> 管理员登录
            </button>
        `;
    }
}

// 进入编辑模式
function enterEditMode() {
    isEditMode = true;
    updateAdminButton();
    loadNavigation();
}

// 退出编辑模式
function exitEditMode() {
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

// 退出登录
function handleLogout() {
    setToken(null);
    isAdmin = false;
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

// 搜索处理
function handleSearch(event) {
    event.preventDefault();
    const searchInput = document.getElementById('searchInput');
    const searchEngine = document.getElementById('searchEngine');
    const query = searchInput.value.trim();
    
    if (query) {
        const url = SEARCH_ENGINES[searchEngine.value].url + encodeURIComponent(query);
        window.open(url, '_blank');
    }

    // 保存用户选择
    saveSearchEngine(searchEngine.value);
}

// 管理员登录相关
function openAdminModal() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    
    try {
        await login(password);
        closeAdminModal();
        isAdmin = true;
        updateAdminButton();
        showToast('登录成功');
        await loadNavigation(); // 重新加载导航以显示私密链接
    } catch (error) {
        showToast('登录失败: ' + error.message, 'error');
    }
}

// 链接管理相关
async function openLinkModal(linkId = null) {
    if (!isEditMode) {
        showToast('请先登录管理员账号');
        return;
    }
    
    const modal = document.getElementById('linkModal');
    const form = document.getElementById('linkForm');
    form.reset();
    form.dataset.linkId = linkId || '';
    form.dataset.orderNum = '';
    
    await updateGroupSelect();
    
    if (linkId) {
        await loadLinkData(linkId);
    }
    
    // 添加 URL 输入框的失焦事件监听
    const urlInput = document.getElementById('linkUrl');
    urlInput.removeEventListener('blur', autoFillLinkInfo); // 先移除旧的监听器
    urlInput.addEventListener('blur', autoFillLinkInfo);
    
    modal.style.display = 'block';
}

function closeLinkModal() {
    document.getElementById('linkModal').style.display = 'none';
}

async function handleLinkSubmit(event) {
    event.preventDefault();
    const linkId = event.target.dataset.linkId;
    const groupId = parseInt(document.getElementById('linkGroup').value);
    
    let orderNum;
    if (linkId) {
        // 编辑现有链接
        const links = await fetchLinks();
        const currentLink = links.find(l => l.id === parseInt(linkId));
        
        if (currentLink && currentLink.group_id !== groupId) {
            // 如果分组发生变化
            try {
                // 处理原分组中的链接序号
                const oldGroupLinks = links
                    .filter(l => l.group_id === currentLink.group_id)
                    .sort((a, b) => a.order_num - b.order_num);
                
                // 更新原分组中序号大于当前链接的所有链接
                for (let i = 0; i < oldGroupLinks.length; i++) {
                    const link = oldGroupLinks[i];
                    if (link.order_num > currentLink.order_num) {
                        await updateLink(link.id, {
                            ...link,
                            order_num: link.order_num - 1
                        });
                    }
                }
                
                // 获取新分组的最大序号
                const groupLinks = links.filter(l => l.group_id === groupId);
                groupLinks.sort((a, b) => a.order_num - b.order_num);
                orderNum = groupLinks.length + 1;
            } catch (error) {
                showToast('更新序号失败: ' + error.message, 'error');
                return;
            }
        } else {
            // 如果分组没变，保持原序号
            orderNum = parseInt(event.target.dataset.orderNum) || 0;
        }
    } else {
        // 添加新链接
        try {
            const links = await fetchLinks();
            const groupLinks = links.filter(l => l.group_id === groupId);
            // 找到当前分组中最大的序号
            const maxOrderNum = groupLinks.reduce((max, link) => 
                Math.max(max, link.order_num || 0), 0);
            orderNum = maxOrderNum + 1;
        } catch (error) {
            console.error('获取链接序号失败:', error);
            orderNum = 1; // 如果出错，默认使用1
        }
    }
    
    const formData = {
        name: document.getElementById('linkName').value,
        url: document.getElementById('linkUrl').value,
        logo: document.getElementById('linkLogo').value,
        description: document.getElementById('linkDescription').value,
        group_id: groupId,
        order_num: orderNum
    };
    
    try {
        if (linkId) {
            await updateLink(parseInt(linkId), formData);
        } else {
            await createLink(formData);
        }
        
        closeLinkModal();
        showToast('保存成功');
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 分组管理相关
function openGroupModal(groupId = null) {
    if (!isEditMode) {
        showToast('请先登录管理员账号');
        return;
    }
    
    const modal = document.getElementById('groupModal');
    const form = document.getElementById('groupForm');
    form.reset();
    form.dataset.groupId = groupId || '';
    
    if (groupId) {
        loadGroupData(groupId);
    }
    
    modal.style.display = 'block';
}

function closeGroupModal() {
    document.getElementById('groupModal').style.display = 'none';
}

function openBackgroundModal() {
    if (!isEditMode) {
        showToast('请先登录管理员账号');
        return;
    }

    const settings = currentBackgroundSettings;
    const opacity = getBackgroundOpacityValue(settings?.opacity ?? 50);
    selectedBackgroundDataUrl = '';
    document.getElementById('backgroundUrl').value = settings?.image_source || '';
    document.getElementById('backgroundFile').value = '';
    document.getElementById('backgroundMode').value = settings?.mode || 'cover';
    document.getElementById('backgroundOpacity').value = opacity;
    updateBackgroundOpacityDisplay(opacity);
    document.getElementById('backgroundModal').style.display = 'block';
}

function closeBackgroundModal() {
    document.getElementById('backgroundModal').style.display = 'none';
    selectedBackgroundDataUrl = '';
    applyBackgroundSettings(currentBackgroundSettings);
}

async function handleBackgroundSubmit(event) {
    event.preventDefault();
    const url = document.getElementById('backgroundUrl').value.trim();
    const mode = document.getElementById('backgroundMode').value;
    const opacity = getBackgroundOpacityValue(document.getElementById('backgroundOpacity').value);

    if (!url && !selectedBackgroundDataUrl && !currentBackgroundSettings?.image_data) {
        await resetBackground();
        return;
    }

    const toast = showToast('正在保存背景...', 'loading');
    try {
        const sourceChanged = url && url !== (currentBackgroundSettings?.image_source || '');
        currentBackgroundSettings = await saveBackgroundSettingsAPI({
            image_url: selectedBackgroundDataUrl ? '' : url,
            image_data: selectedBackgroundDataUrl || (sourceChanged ? '' : currentBackgroundSettings?.image_data || ''),
            mode,
            opacity
        });
        selectedBackgroundDataUrl = '';
        applyBackgroundSettings(currentBackgroundSettings);
        document.getElementById('backgroundModal').style.display = 'none';
        toast.remove();
        showToast('背景已保存到数据库');
    } catch (error) {
        toast.remove();
        showToast('背景保存失败: ' + error.message, 'error');
        applyBackgroundSettings(currentBackgroundSettings);
    }
}

async function resetBackground() {
    const toast = showToast('正在恢复默认背景...', 'loading');
    try {
        await deleteBackgroundSettings();
        currentBackgroundSettings = null;
        selectedBackgroundDataUrl = '';
        clearBackgroundStyles();
        document.getElementById('backgroundModal').style.display = 'none';
        toast.remove();
        showToast('已恢复默认背景');
    } catch (error) {
        toast.remove();
        showToast('恢复默认失败: ' + error.message, 'error');
    }
}

async function handleGroupSubmit(event) {
    event.preventDefault();
    const groupId = event.target.dataset.groupId;
    
    // 获取当前最大序号
    const groups = await fetchGroups();
    const maxOrderNum = Math.max(0, ...groups.map(g => g.order_num || 0));
    
    const formData = {
        name: document.getElementById('groupName').value,
        is_private: document.getElementById('groupPrivate').checked,
        order_num: groupId ? parseInt(event.target.dataset.orderNum) || 0 : maxOrderNum + 1
    };
    
    try {
        if (groupId) {
            await updateGroup(groupId, formData);
        } else {
            await createGroup(formData);
        }
        closeGroupModal();
        showToast('分组保存成功');
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 图标缓存
const iconCache = new Map();

// 获取图标URL并缓存
async function getIconUrl({ url }) {
    try {
        const domain = new URL(url).hostname;
        // 先检查本地缓存
        const cacheKey = `icon_cache_${domain}`;
        const cachedUrl = localStorage.getItem(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }
        
        // 尝试不同的图标服务，按可靠性排序
        const iconUrls = [
            // 使用 Icon Horse 服务（支持 CORS）
            `https://icon.horse/icon/${domain}`,
            // 使用 Favicon Kit（支持 CORS）
            `https://api.faviconkit.com/${domain}/144`,
            // 最后尝试网站自身的图标
            `https://${domain}/favicon.ico`
        ];
        
        // 依次尝试每个图标源
        for (const iconUrl of iconUrls) {
            try {
                // 直接使用 img 标签测试图标是否可用
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = iconUrl;
                });
                
                // 如果图片加载成功，缓存并返回URL
                localStorage.setItem(cacheKey, iconUrl);
                return iconUrl;
            }
            catch (error) {
                continue;
            }
        }
        
        // 如果所有尝试都失败了，返回 null 使用备选图标
        return null;
    } catch (error) {
        return null;
    }
}

// 导航内容加载
async function loadNavigation() {
    const navigationElement = document.getElementById('navigation');
    const groupNavElement = document.getElementById('groupNav');
    
    // 设置加载状态
    const loadingHtml = `
        <div class="nav-loading">
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
        </div>
    `;
    
    navigationElement.innerHTML = `
        <div class="loading">
            <div class="loading-wave">
                <div></div>
                <div></div>
            </div>
            <div>加载中...</div>
        </div>
    `;
    groupNavElement.innerHTML = loadingHtml;
    
    try {
        const groups = (await fetchGroups()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        const links = (await fetchLinks()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        currentGroups = groups;
        currentLinks = links;
        
        let html = '';
        let navHtml = '';
        
        // 如果是编辑模式，添加管理按钮
        if (isEditMode) {
            html += `
                <div class="admin-controls">
                    <button onclick="openGroupModal()">
                        <i class="fas fa-folder-plus"></i> 添加分组
                    </button>
                    <button onclick="openLinkModal()">
                        <i class="fas fa-link"></i> 添加链接
                    </button>
                    <button onclick="openBackgroundModal()">
                        <i class="fas fa-image"></i> 设置背景
                    </button>
                </div>
            `;
        }
        
        // 如果没有数据，显示相应提示
        if (groups.length === 0) {
            navigationElement.innerHTML = html + '暂无内容';
            groupNavElement.innerHTML = '暂无分组';
            return;
        }
        
        for (const group of groups) {
            if (!group.is_private || isAdmin) {
                const groupLinks = links
                    .filter(link => link.group_id === group.id)
                    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
                const groupId = `group-${group.id}`;
                
                html += `
                    <div id="${groupId}" class="group ${isEditMode ? 'is-draggable' : ''}"
                         data-group-id="${group.id}"
                         ${isEditMode ? 'draggable="true"' : ''}>
                        <div class="group-title">
                            ${getGroupTitle(group)}
                            ${getGroupActions(group.id)}
                        </div>
                        <div class="links" data-group-id="${group.id}">
                            ${groupLinks.map(link => getLinkCard(link)).join('')}
                        </div>
                    </div>
                `;
                
                navHtml += `
                    <a href="#${groupId}" 
                       class="nav-item" 
                       onclick="highlightNavItem(this)"
                       data-group-id="${groupId}">
                        ${group.name}
                        ${group.is_private ? 
                            `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : ''
                        }
                    </a>
                `;
            }
        }
        
        // 更新内容
        navigationElement.innerHTML = html;
        groupNavElement.innerHTML = navHtml;
        
        // 加载图标
        await loadIcons();
        initializeDragSorting();
        
        // 监听滚动事件来更新活动项
        window.addEventListener('scroll', updateActiveNavItem);
    } catch (error) {
        // 显示错误信息
        navigationElement.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
        groupNavElement.innerHTML = `<div class="error">加载失败</div>`;
    }
}

// 高亮当前选中的导航项
function highlightNavItem(element) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
}

// 根据滚动位置更新活动导航项
function updateActiveNavItem() {
    const groups = document.querySelectorAll('.group');
    const navItems = document.querySelectorAll('.nav-item');
    
    groups.forEach((group, index) => {
        const rect = group.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom >= 100) {
            highlightNavItem(navItems[index]);
        }
    });
}

// 创建链接卡片
function createLinkCard(link) {
    const domain = new URL(link.url).hostname;
    const defaultIcon = `https://icon.horse/icon/${domain}`;

    return `
        <div class="link-card">
            <a href="${link.url}" target="_blank" class="link-content">
                <img class="link-icon" src="${link.logo || defaultIcon}" 
                     alt="" onerror="this.src='https://icon.horse/icon/example.com'">
                <div class="link-card-content">
                    <div class="link-title">${link.name}</div>
                    ${link.description ? `<div class="link-description">${link.description}</div>` : ''}
                </div>
            </a>
            <div class="link-url-tooltip">${link.url}</div>
            ${isEditMode ? `
                <div class="link-actions">
                    <button onclick="openLinkModal(${link.id})"><i class="fas fa-edit"></i> 编辑</button>
                    <button onclick="deleteLinkConfirm(${link.id})"><i class="fas fa-trash"></i> 删除</button>
                    <div class="order-actions">
                        <button onclick="moveLinkUp(${link.id}, ${link.group_id})"><i class="fas fa-arrow-up"></i></button>
                        <button onclick="moveLinkDown(${link.id}, ${link.group_id})"><i class="fas fa-arrow-down"></i></button>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// 提示消息
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-times-circle"></i>';
            break;
        case 'loading':
            icon = '<i class="fas fa-spinner"></i>';
            break;
    }
    
    toast.innerHTML = `${icon}${message}`;
    container.appendChild(toast);
    
    // 3秒后自动移除
    if (type !== 'loading') {
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    return toast;
}

// 显示确认对话框
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirmDialog');
        dialog.querySelector('.confirm-title').textContent = title;
        dialog.querySelector('.confirm-message').textContent = message;
        dialog.style.display = 'block';
        
        const handleClick = (result) => {
            dialog.style.display = 'none';
            resolve(result);
        };
        
        dialog.querySelector('.confirm-ok').onclick = () => handleClick(true);
        dialog.querySelector('.confirm-cancel').onclick = () => handleClick(false);
    });
}

// 关闭模态框的其他方式
window.onclick = function(event) {
    const modal = document.getElementById('adminModal');
    if (event.target === modal) {
        closeAdminModal();
    }
}

// 删除分组确认
async function deleteGroupConfirm(groupId) {
    const confirmed = await showConfirm(
        '删除分组',
        '确定要删除这个分组吗？这将同时删除组内的所有链接！'
    );
    
    if (confirmed) {
        const toast = showToast('正在删除分组...', 'loading');
        try {
            await deleteGroup(groupId);
            toast.remove();
            showToast('分组删除成功');
            await loadNavigation();
        } catch (error) {
            toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

// 加载分组数据到表单
async function loadGroupData(groupId) {
    try {
        const groups = await fetchGroups();
        const group = groups.find(g => g.id === parseInt(groupId));
        if (group) {
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupPrivate').checked = group.is_private;
            const form = document.getElementById('groupForm');
            form.dataset.groupId = groupId;
            form.dataset.orderNum = group.order_num;
        }
    } catch (error) {
        showToast('加载分组数据失败: ' + error.message, 'error');
    }
}

// 加载链接数据到表单
async function loadLinkData(linkId) {
    try {
        const links = await fetchLinks();
        const link = links.find(l => l.id === linkId);
        if (link) {
            document.getElementById('linkName').value = link.name;
            document.getElementById('linkUrl').value = link.url;
            document.getElementById('linkLogo').value = link.logo || '';
            document.getElementById('linkDescription').value = link.description || '';
            document.getElementById('linkGroup').value = link.group_id;
            document.getElementById('linkForm').dataset.linkId = linkId;
            document.getElementById('linkForm').dataset.orderNum = link.order_num;
        }
    } catch (error) {
        showToast('加载链接数据失败: ' + error.message, 'error');
    }
}

// 更新分组下拉列表
async function updateGroupSelect() {
    const select = document.getElementById('linkGroup');
    try {
        const groups = await fetchGroups();
        select.innerHTML = '<option value="">选择分组...</option>' +
            groups.map(group => 
                `<option value="${group.id}">${group.name}</option>`
            ).join('');
    } catch (error) {
        console.error('加载分组列表失败:', error);
    }
}

// 删除链接确认
async function deleteLinkConfirm(linkId) {
    const confirmed = await showConfirm(
        '删除链接',
        '确定要删除这个链接吗？'
    );
    
    if (confirmed) {
        const toast = showToast('正在删除链接...', 'loading');
        try {
            await deleteLink(linkId);
            toast.remove();
            showToast('链接删除成功');
            await loadNavigation();
        } catch (error) {
            toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

// 链接排序功能
async function moveLinkUp(linkId, groupId) {
    let toast;
    const links = (await fetchLinks())
        .filter(l => l.group_id === groupId)
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === 0) {
        if (toast) toast.remove();
        showToast('已经是第一个链接了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const prevLink = links[currentIndex - 1];
    try {
        await updateLink(currentLink.id, getLinkUpdatePayload(currentLink, {
            order_num: prevLink.order_num
        }));
        await updateLink(prevLink.id, getLinkUpdatePayload(prevLink, {
            order_num: currentLink.order_num
        }));
        
        toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    } finally {
        if (toast) toast.remove();
    }
}

async function moveLinkDown(linkId, groupId) {
    let toast;
    const links = (await fetchLinks())
        .filter(l => l.group_id === groupId)
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === links.length - 1) {
        if (toast) toast.remove();
        showToast('已经是最后一个链接了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const nextLink = links[currentIndex + 1];
    try {
        await updateLink(currentLink.id, getLinkUpdatePayload(currentLink, {
            order_num: nextLink.order_num
        }));
        await updateLink(nextLink.id, getLinkUpdatePayload(nextLink, {
            order_num: currentLink.order_num
        }));
        
        toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    } finally {
        if (toast) toast.remove();
    }
}

// 自动获取网页信息
async function autoFillLinkInfo() {
    const urlInput = document.getElementById('linkUrl');
    const nameInput = document.getElementById('linkName');
    const logoInput = document.getElementById('linkLogo');
    const descriptionInput = document.getElementById('linkDescription');
    const url = urlInput.value.trim();

    if (!url) return;

    const toast = showToast('正在获取网页信息...', 'loading');
    try {
        // 获取网站图标
        const domain = new URL(url).hostname;
        const iconUrl = await getIconUrl({ url });
        
        // 获取网页信息
        const info = await fetchWebInfo(url);
        
        // 只在字段为空时填充
        if (!nameInput.value) {
            nameInput.value = info.title || '';
        }
        if (!logoInput.value) {
            logoInput.value = iconUrl || '';
        }
        if (!descriptionInput.value) {
            descriptionInput.value = info.description || '';
        }
        
        toast.remove();
        showToast('获取网页信息成功');
    } catch (error) {
        toast.remove();
        showToast('获取网页信息失败: ' + error.message, 'error');
    }
}

// 分组排序功能
async function moveGroupUp(groupId) {
    let toast;
    const groups = (await fetchGroups()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === 0) {
        if (toast) toast.remove();
        showToast('已经是第一个分组了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const prevGroup = groups[currentIndex - 1];
    try {
        await updateGroup(currentGroup.id, getGroupUpdatePayload(currentGroup, {
            order_num: prevGroup.order_num
        }));
        await updateGroup(prevGroup.id, getGroupUpdatePayload(prevGroup, {
            order_num: currentGroup.order_num
        }));
        
        toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    } finally {
        if (toast) toast.remove();
    }
}

async function moveGroupDown(groupId) {
    let toast;
    const groups = (await fetchGroups()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === groups.length - 1) {
        if (toast) toast.remove();
        showToast('已经是最后一个分组了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const nextGroup = groups[currentIndex + 1];
    try {
        await updateGroup(currentGroup.id, getGroupUpdatePayload(currentGroup, {
            order_num: nextGroup.order_num
        }));
        await updateGroup(nextGroup.id, getGroupUpdatePayload(nextGroup, {
            order_num: currentGroup.order_num
        }));
        
        toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    } finally {
        if (toast) toast.remove();
    }
}

function getLinkUpdatePayload(link, overrides = {}) {
    return {
        name: link.name,
        url: link.url,
        logo: link.logo || '',
        description: link.description || '',
        group_id: link.group_id,
        order_num: link.order_num || 0,
        ...overrides
    };
}

function getGroupUpdatePayload(group, overrides = {}) {
    return {
        name: group.name,
        is_private: !!group.is_private,
        order_num: group.order_num || 0,
        ...overrides
    };
}

function initializeDragSorting() {
    if (!isEditMode) return;

    document.querySelectorAll('.link-card').forEach(card => {
        card.addEventListener('dragstart', handleLinkDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('click', preventClickWhileDragging);
    });

    document.querySelectorAll('.links').forEach(container => {
        container.addEventListener('dragover', handleLinkDragOver);
        container.addEventListener('drop', handleLinkDrop);
        container.addEventListener('dragleave', handleDragLeave);
    });

    document.querySelectorAll('.group').forEach(group => {
        group.addEventListener('dragstart', handleGroupDragStart);
        group.addEventListener('dragover', handleGroupDragOver);
        group.addEventListener('drop', handleGroupDrop);
        group.addEventListener('dragend', handleDragEnd);
    });
}

function preventClickWhileDragging(event) {
    if (event.currentTarget.classList.contains('was-dragging')) {
        event.preventDefault();
        event.currentTarget.classList.remove('was-dragging');
    }
}

function handleLinkDragStart(event) {
    event.stopPropagation();
    const linkId = parseInt(event.currentTarget.dataset.linkId);
    draggedItem = { type: 'link', id: linkId };
    event.currentTarget.classList.add('dragging');
    event.currentTarget.classList.add('was-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `link:${linkId}`);
}

function handleGroupDragStart(event) {
    if (event.target.closest('.link-card') || event.target.closest('button')) return;
    const groupId = parseInt(event.currentTarget.dataset.groupId);
    draggedItem = { type: 'group', id: groupId };
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `group:${groupId}`);
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(element => element.classList.remove('drag-over'));
    draggedItem = null;
}

function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

function getDragAfterElement(container, y, selector) {
    const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function handleLinkDragOver(event) {
    if (!draggedItem || draggedItem.type !== 'link') return;
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';

    const afterElement = getDragAfterElement(event.currentTarget, event.clientY, '.link-card');
    const draggingCard = document.querySelector('.link-card.dragging');
    if (!draggingCard) return;

    if (afterElement == null) {
        event.currentTarget.appendChild(draggingCard);
    } else {
        event.currentTarget.insertBefore(draggingCard, afterElement);
    }
}

async function handleLinkDrop(event) {
    if (!draggedItem || draggedItem.type !== 'link') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');

    const linkId = draggedItem.id;
    const targetGroupId = parseInt(event.currentTarget.dataset.groupId);
    const movedLink = currentLinks.find(link => link.id === linkId);
    if (!movedLink || !targetGroupId) return;

    const targetOrderIds = [...event.currentTarget.querySelectorAll('.link-card')]
        .map(card => parseInt(card.dataset.linkId))
        .filter(Boolean);

    const affectedGroupIds = new Set([movedLink.group_id, targetGroupId]);
    const updates = [];

    for (const groupId of affectedGroupIds) {
        let orderedLinks;
        if (groupId === targetGroupId) {
            orderedLinks = targetOrderIds
                .map(id => {
                    const link = currentLinks.find(item => item.id === id);
                    return id === linkId ? { ...movedLink, group_id: targetGroupId } : link;
                })
                .filter(Boolean);
        } else {
            orderedLinks = currentLinks
                .filter(link => link.group_id === groupId && link.id !== linkId)
                .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        }

        orderedLinks.forEach((link, index) => {
            const nextOrder = index + 1;
            if (link.order_num !== nextOrder || link.group_id !== groupId) {
                updates.push({
                    link,
                    payload: getLinkUpdatePayload(link, {
                        group_id: groupId,
                        order_num: nextOrder
                    })
                });
            }
        });
    }

    if (updates.length === 0) return;

    const toast = showToast('正在保存排序...', 'loading');
    try {
        for (const update of updates) {
            await updateLink(update.link.id, update.payload);
        }
        toast.remove();
        showToast('排序已保存');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('排序保存失败: ' + error.message, 'error');
        await loadNavigation();
    }
}

function handleGroupDragOver(event) {
    if (!draggedItem || draggedItem.type !== 'group') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const navigation = document.getElementById('navigation');
    const afterElement = getDragAfterElement(navigation, event.clientY, '.group');
    const draggingGroup = document.querySelector('.group.dragging');
    if (!draggingGroup) return;

    if (afterElement == null) {
        navigation.appendChild(draggingGroup);
    } else {
        navigation.insertBefore(draggingGroup, afterElement);
    }
}

async function handleGroupDrop(event) {
    if (!draggedItem || draggedItem.type !== 'group') return;
    event.preventDefault();
    event.stopPropagation();

    const orderedGroupIds = [...document.querySelectorAll('#navigation > .group')]
        .map(group => parseInt(group.dataset.groupId))
        .filter(Boolean);

    const updates = orderedGroupIds
        .map((groupId, index) => {
            const group = currentGroups.find(item => item.id === groupId);
            return group && group.order_num !== index + 1
                ? { group, payload: getGroupUpdatePayload(group, { order_num: index + 1 }) }
                : null;
        })
        .filter(Boolean);

    if (updates.length === 0) return;

    const toast = showToast('正在保存分组排序...', 'loading');
    try {
        for (const update of updates) {
            await updateGroup(update.group.id, update.payload);
        }
        toast.remove();
        showToast('分组排序已保存');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('分组排序保存失败: ' + error.message, 'error');
        await loadNavigation();
    }
}

// 生成分组操作按钮
function getGroupActions(groupId) {
    if (!isEditMode) return '';
    
    return `
        <div class="group-actions">
            <div class="order-actions">
                <button onclick="moveGroupUp(${groupId})" title="上移">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button onclick="moveGroupDown(${groupId})" title="下移">
                    <i class="fas fa-arrow-down"></i>
                </button>
            </div>
            <button onclick="openGroupModal(${groupId})" title="编辑">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteGroupConfirm(${groupId})" title="删除">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// 生成分组标题
function getGroupTitle(group) {
    return `
        <div class="group-title-left">
            ${group.name}
            ${group.is_private ? 
                `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : 
                (isEditMode ? `<i class="fas fa-lock-open group-privacy-icon" title="公开分组"></i>` : '')
            }
        </div>
    `;
}

// 生成链接卡片
function getLinkCard(link) {
    const iconSrc = link.logo || '#';
    const defaultIcon = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="12" fill="#4299e1" opacity="0.1"/>
            <path fill="#4299e1" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
    `.trim());

    return `
        <a href="${link.url}" target="_blank"
           class="link-card ${isEditMode ? 'is-draggable' : ''}"
           data-link-id="${link.id}"
           data-group-id="${link.group_id}"
           ${isEditMode ? 'draggable="true"' : ''}>
            ${isEditMode ? '<span class="drag-handle" title="拖动排序"><i class="fas fa-grip-vertical"></i></span>' : ''}
            <div class="link-info">
                <div class="link-icon">
                    <img src="${iconSrc}" 
                        data-url="${link.url}"
                        alt="${link.name}" 
                        ${!link.logo ? 'data-auto-icon="true"' : ''}
                        onerror="this.onerror=null; this.src='data:image/svg+xml,${defaultIcon}';">
                </div>
                <div class="link-text">
                    <span class="link-title">
                        ${link.name}
                    </span>
                    <div class="link-description">${link.description || ''}</div>
                </div>
            </div>
            ${isEditMode ? `
                <div class="link-actions" onclick="event.preventDefault();">
                    <div class="order-actions">
                        <button onclick="moveLinkUp(${link.id}, ${link.group_id})" title="上移">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button onclick="moveLinkDown(${link.id}, ${link.group_id})" title="下移">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                    </div>
                    <button onclick="openLinkModal(${link.id})" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteLinkConfirm(${link.id})" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        </a>
    `;
}

// 根据URL获取合适的后备图标
function getFallbackIcon(url) {
    const domain = new URL(url).hostname.toLowerCase();
    
    // 常见网站的图标映射
    const iconMap = {
        'github.com': 'github',
        'youtube.com': 'youtube',
        'twitter.com': 'twitter',
        'facebook.com': 'facebook',
        'instagram.com': 'instagram',
        'linkedin.com': 'linkedin',
        'medium.com': 'medium',
        'reddit.com': 'reddit',
        'stackoverflow.com': 'stack-overflow',
        'amazon.com': 'amazon',
        'google.com': 'google',
        'microsoft.com': 'microsoft',
        'apple.com': 'apple',
        'netflix.com': 'netflix',
        'spotify.com': 'spotify',
        'twitch.tv': 'twitch',
        'wikipedia.org': 'wikipedia-w',
        'wordpress.com': 'wordpress',
        'blogger.com': 'blogger',
        'pinterest.com': 'pinterest'
    };

    // 检查是否是已知网站
    for (const [site, icon] of Object.entries(iconMap)) {
        if (domain.includes(site)) {
            return icon;
        }
    }

    // 根据URL类型返回通用图标
    if (domain.includes('docs.') || domain.endsWith('.doc')) return 'file-word';
    if (domain.includes('sheets.') || domain.endsWith('.xls')) return 'file-excel';
    if (domain.includes('slides.') || domain.endsWith('.ppt')) return 'file-powerpoint';
    if (domain.includes('drive.') || domain.includes('cloud')) return 'cloud';
    if (domain.includes('mail.') || domain.includes('outlook')) return 'envelope';
    if (domain.includes('chat.') || domain.includes('meet.')) return 'comments';
    if (domain.includes('map')) return 'map-marker-alt';
    if (domain.includes('video') || domain.includes('tv')) return 'video';
    if (domain.includes('music') || domain.includes('audio')) return 'music';
    if (domain.includes('shop') || domain.includes('store')) return 'shopping-cart';
    if (domain.includes('game')) return 'gamepad';
    if (domain.includes('news')) return 'newspaper';
    if (domain.includes('blog')) return 'blog';
    
    // 默认图标
    return 'link';
}

// 加载图标
async function loadIcons() {
    const icons = document.querySelectorAll('.link-icon img');
    for (const img of icons) {
        if (img.dataset.autoIcon === 'true') {
            const url = img.dataset.url;
            if (url) {
                try {
                    const iconUrl = await getIconUrl({ url });
                    if (iconUrl) {
                        img.src = iconUrl;
                        img.crossOrigin = 'anonymous';
                    } else {
                        throw new Error('No icon found');
                    }
                } catch (error) {
                    img.src = defaultIcon;
                }
            }
        }
    }
}


// 站内导航模糊搜索：名称、描述、URL
function filterNavigation(keyword) {
    const groups = document.querySelectorAll('.group');

    keyword = keyword.toLowerCase();

    groups.forEach(group => {
        let matched = false;

        group.querySelectorAll('.link-card').forEach(card => {
            const text = (card.innerText || '').toLowerCase();
            const url = (card.href || '').toLowerCase();

            const ok = !keyword || text.includes(keyword) || url.includes(keyword);
            card.style.display = ok ? '' : 'none';

            if (ok) matched = true;
        });

        group.style.display = matched || !keyword ? '' : 'none';
    });
}
