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

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function safeHttpUrl(value, fallback = '#') {
    try {
        const parsed = new URL(String(value));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : fallback;
    } catch {
        return fallback;
    }
}

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
    searchEngine.addEventListener('change', () => saveSearchEngine(searchEngine.value));

    // 站内实时模糊搜索
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterNavigation(searchInput.value.trim());
        });
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeNavDrawer();
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.search-panel')) {
            window.setTimeout(clearMainSearch, 0);
        }
    });
    window.addEventListener('scroll', () => {
        updateActiveNavItem();
        document.getElementById('backToTopButton')?.classList.toggle('is-visible', window.scrollY > 500);
    }, { passive: true });
    
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

function getPanelTransparencyValue(value) {
    const transparency = parseInt(value, 10);
    if (Number.isNaN(transparency)) return 0;
    return Math.min(92, Math.max(0, transparency));
}

function updatePanelTransparencyDisplay(value) {
    const transparency = getPanelTransparencyValue(value);
    const display = document.getElementById('panelTransparencyValue');
    if (display) display.textContent = `${transparency}%`;
}

function applyPanelTransparency(value) {
    const transparency = getPanelTransparencyValue(value);
    document.body.classList.toggle('transparent-panels', transparency > 0);
    const remaining = 1 - transparency / 100;
    const panelAlpha = Math.max(0.025, remaining * remaining * 0.7);
    document.body.style.setProperty('--panel-user-alpha', panelAlpha.toFixed(3));
    document.body.style.setProperty('--panel-nav-alpha', Math.min(0.22, panelAlpha + 0.045).toFixed(3));
}

function updateBackgroundSourceStatus(message, type = 'info') {
    const status = document.getElementById('backgroundSourceStatus');
    if (!status) return;
    status.className = `background-source-status ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
    status.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
}

function initializeBackgroundControls() {
    const opacityInput = document.getElementById('backgroundOpacity');
    const urlInput = document.getElementById('backgroundUrl');
    const modeInput = document.getElementById('backgroundMode');
    const fileInput = document.getElementById('backgroundFile');
    const panelInput = document.getElementById('panelTransparency');
    if (!opacityInput) return;

    opacityInput.addEventListener('input', () => {
        updateBackgroundOpacityDisplay(opacityInput.value);
        previewBackgroundSettings();
    });

    urlInput?.addEventListener('input', () => {
        selectedBackgroundDataUrl = '';
        const value = urlInput.value.trim();
        if (!value) updateBackgroundSourceStatus('当前使用已保存的背景');
        else if (!safeHttpUrl(value, '')) updateBackgroundSourceStatus('请输入有效的 HTTP/HTTPS 图片地址', 'error');
        else updateBackgroundSourceStatus('图片 URL 已解析，保存后将同步到数据库', 'success');
        previewBackgroundSettings();
    });
    modeInput?.addEventListener('change', previewBackgroundSettings);
    fileInput?.addEventListener('change', handleBackgroundFileChange);
    panelInput?.addEventListener('input', () => {
        updatePanelTransparencyDisplay(panelInput.value);
        applyPanelTransparency(panelInput.value);
    });
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
    applyPanelTransparency(settings?.panel_transparency ?? 50);
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
    const currentImage = currentBackgroundSettings?.image_data || '';
    const currentSource = currentBackgroundSettings?.image_source || '';
    const safeUrl = safeHttpUrl(url, '');
    const previewImage = selectedBackgroundDataUrl ||
        (safeUrl && safeUrl === safeHttpUrl(currentSource, '') && currentImage ? currentImage : safeUrl) ||
        currentImage;
    const panelTransparency = document.getElementById('panelTransparency')?.value ?? 50;
    applyPanelTransparency(panelTransparency);

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
        updateBackgroundSourceStatus('当前使用已保存的背景');
        previewBackgroundSettings();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        updateBackgroundSourceStatus('文件格式不受支持', 'error');
        event.target.value = '';
        return;
    }

    if (file.size > 4 * 1024 * 1024) {
        showToast('背景图片不能超过 4MB', 'error');
        updateBackgroundSourceStatus('图片超过 4MB，请重新选择', 'error');
        event.target.value = '';
        return;
    }

    try {
        selectedBackgroundDataUrl = await readFileAsDataUrl(file);
        document.getElementById('backgroundUrl').value = '';
        updateBackgroundSourceStatus(`已选择 ${file.name}，保存后上传到数据库`, 'success');
        previewBackgroundSettings();
    } catch (error) {
        showToast(error.message, 'error');
        updateBackgroundSourceStatus('读取图片失败', 'error');
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
                <i class="fas fa-user-lock"></i> 登录
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
    clearMainSearch();
}

function clearMainSearch() {
    const input = document.getElementById('searchInput');
    if (!input || !input.value) return;
    input.value = '';
    filterNavigation('');
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
    document.getElementById('groupModalTitle').textContent = groupId ? '编辑分组' : '添加分组';
    document.getElementById('groupModalSubtitle').textContent = groupId ? '修改分组名称和可见范围' : '创建一个新的网址分类';
    
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
    const panelTransparency = getPanelTransparencyValue(settings?.panel_transparency ?? 50);
    selectedBackgroundDataUrl = '';
    document.getElementById('backgroundUrl').value = settings?.image_source || '';
    document.getElementById('backgroundFile').value = '';
    document.getElementById('backgroundMode').value = settings?.mode || 'cover';
    document.getElementById('backgroundOpacity').value = opacity;
    updateBackgroundOpacityDisplay(opacity);
    document.getElementById('panelTransparency').value = panelTransparency;
    updatePanelTransparencyDisplay(panelTransparency);
    updateBackgroundSourceStatus(settings?.image_data ? '当前使用已保存的背景，可直接调整效果' : '请选择图片或粘贴图片 URL');
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
    const panelTransparency = getPanelTransparencyValue(document.getElementById('panelTransparency').value);

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
            opacity,
            panel_transparency: panelTransparency
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
                    <div id="${groupId}" class="group" data-group-id="${group.id}">
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
                       class="nav-item ${isEditMode ? 'is-draggable' : ''}"
                       onclick="handleGroupNavClick(this)"
                       data-group-id="${groupId}"
                       data-group-numeric-id="${group.id}"
                       ${isEditMode ? 'draggable="true" title="拖动调整分组顺序"' : ''}>
                        ${isEditMode ? '<i class="fas fa-grip-vertical nav-drag-handle"></i>' : ''}
                        ${escapeHtml(group.name)}
                        ${group.is_private ? 
                            `<i class="fas fa-lock group-privacy-icon" title="隐藏分组"></i>` : ''
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
        
        updateActiveNavItem();
    } catch (error) {
        // 显示错误信息
        navigationElement.innerHTML = `<div class="error">加载失败: ${escapeHtml(error.message)}</div>`;
        groupNavElement.innerHTML = `<div class="error">加载失败</div>`;
    }
}

// 高亮当前选中的导航项
function highlightNavItem(element) {
    if (!element) return;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    const navList = document.getElementById('groupNav');
    if (navList) {
        const itemTop = element.offsetTop;
        const itemBottom = itemTop + element.offsetHeight;
        if (itemTop < navList.scrollTop) navList.scrollTo({ top: itemTop - 8, behavior: 'smooth' });
        if (itemBottom > navList.scrollTop + navList.clientHeight) {
            navList.scrollTo({ top: itemBottom - navList.clientHeight + 8, behavior: 'smooth' });
        }
    }
}

function handleGroupNavClick(element) {
    if (element.classList.contains('was-dragging')) {
        element.classList.remove('was-dragging');
        return false;
    }
    highlightNavItem(element);
    closeNavDrawer();
}

function openNavDrawer() {
    document.getElementById('navSidebar')?.classList.add('is-open');
    document.getElementById('navOverlay')?.classList.add('is-open');
    document.body.classList.add('nav-drawer-open');
}

function closeNavDrawer() {
    document.getElementById('navSidebar')?.classList.remove('is-open');
    document.getElementById('navOverlay')?.classList.remove('is-open');
    document.body.classList.remove('nav-drawer-open');
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
    const safeUrl = safeHttpUrl(link.url);
    const domain = safeUrl === '#' ? 'example.com' : new URL(safeUrl).hostname;
    const defaultIcon = `https://icon.horse/icon/${domain}`;
    const safeLogo = safeHttpUrl(link.logo, defaultIcon);

    return `
        <div class="link-card">
            <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="link-content">
                <img class="link-icon" src="${escapeHtml(safeLogo)}" 
                     alt="" onerror="this.src='https://icon.horse/icon/example.com'">
                <div class="link-card-content">
                    <div class="link-title">${escapeHtml(link.name)}</div>
                    ${link.description ? `<div class="link-description">${escapeHtml(link.description)}</div>` : ''}
                </div>
            </a>
            <div class="link-url-tooltip">${escapeHtml(safeUrl)}</div>
            ${isEditMode ? `
                <div class="link-actions">
                    <button onclick="openLinkModal(${link.id})"><i class="fas fa-edit"></i> 编辑</button>
                    <button onclick="deleteLinkConfirm(${link.id})"><i class="fas fa-trash"></i> 删除</button>
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
    
    toast.innerHTML = icon;
    toast.appendChild(document.createTextNode(String(message)));
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
        select.replaceChildren();
        select.appendChild(new Option('选择分组...', ''));
        groups.forEach(group => select.appendChild(new Option(group.name, String(group.id))));
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
        card.addEventListener('dragstart', handleStableLinkDragStart);
        card.addEventListener('dragend', handleStableLinkDragEnd);
        card.addEventListener('click', preventClickWhileDragging);
    });

    document.querySelectorAll('.links').forEach(container => {
        container.addEventListener('dragover', handleStableLinkDragOver);
        container.addEventListener('drop', handleStableLinkDrop);
        container.addEventListener('dragleave', handleDragLeave);
    });

    document.querySelectorAll('#groupNav .nav-item').forEach(item => {
        item.addEventListener('dragstart', handleNavGroupDragStart);
        item.addEventListener('dragend', handleNavGroupDragEnd);
    });

    const groupNav = document.getElementById('groupNav');
    groupNav?.addEventListener('dragover', handleNavGroupDragOver);
    groupNav?.addEventListener('drop', handleNavGroupDrop);
}

function handleNavGroupDragStart(event) {
    const groupId = Number.parseInt(event.currentTarget.dataset.groupNumericId, 10);
    if (!groupId) return;
    draggedItem = { type: 'nav-group', id: groupId };
    event.currentTarget.classList.add('dragging', 'was-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `nav-group:${groupId}`);
}

function handleNavGroupDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.getElementById('groupNav')?.classList.remove('drag-over');
    draggedItem = null;
}

function handleNavGroupDragOver(event) {
    if (!draggedItem || draggedItem.type !== 'nav-group') return;
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';

    const afterElement = getDragAfterElement(event.currentTarget, event.clientY, '.nav-item');
    const draggingItem = event.currentTarget.querySelector('.nav-item.dragging');
    if (!draggingItem) return;
    if (afterElement) event.currentTarget.insertBefore(draggingItem, afterElement);
    else event.currentTarget.appendChild(draggingItem);
}

async function handleNavGroupDrop(event) {
    if (!draggedItem || draggedItem.type !== 'nav-group') return;
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const orderedGroupIds = [...event.currentTarget.querySelectorAll('.nav-item')]
        .map(item => Number.parseInt(item.dataset.groupNumericId, 10))
        .filter(Boolean);
    await persistGroupOrder(orderedGroupIds, '目录顺序已保存');
}

function preventClickWhileDragging(event) {
    if (event.currentTarget.classList.contains('was-dragging')) {
        event.preventDefault();
        event.currentTarget.classList.remove('was-dragging');
    }
}

function handleStableLinkDragStart(event) {
    const linkId = Number.parseInt(event.currentTarget.dataset.linkId, 10);
    if (!linkId) return;
    draggedItem = { type: 'link', id: linkId };
    event.currentTarget.classList.add('dragging', 'was-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `link:${linkId}`);
}

function handleStableLinkDragEnd(event) {
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

function getGridDragAfterElement(container, x, y) {
    const cards = [...container.querySelectorAll('.link-card:not(.dragging)')];
    return cards.find(card => {
        const box = card.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const pointerInRow = y >= box.top && y <= box.bottom;
        return y < box.top || (pointerInRow && x < centerX);
    }) || null;
}

function handleStableLinkDragOver(event) {
    if (!draggedItem || draggedItem.type !== 'link') return;
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';

    const afterElement = getGridDragAfterElement(event.currentTarget, event.clientX, event.clientY);
    const draggingCard = document.querySelector('.link-card.dragging');
    if (!draggingCard) return;

    if (afterElement == null) {
        event.currentTarget.appendChild(draggingCard);
    } else {
        event.currentTarget.insertBefore(draggingCard, afterElement);
    }
}

async function handleStableLinkDrop(event) {
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
        showToast('链接位置已保存');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('排序保存失败: ' + error.message, 'error');
        await loadNavigation();
    }
}

async function persistGroupOrder(orderedGroupIds, successMessage) {
    const updates = orderedGroupIds
        .map((groupId, index) => {
            const group = currentGroups.find(item => item.id === groupId);
            return group && group.order_num !== index + 1
                ? { group, payload: getGroupUpdatePayload(group, { order_num: index + 1 }) }
                : null;
        })
        .filter(Boolean);

    if (updates.length === 0) {
        draggedItem = null;
        return;
    }

    const toast = showToast('正在保存分组排序...', 'loading');
    try {
        for (const update of updates) {
            await updateGroup(update.group.id, update.payload);
        }
        toast.remove();
        showToast(successMessage);
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('分组排序保存失败: ' + error.message, 'error');
        await loadNavigation();
    } finally {
        draggedItem = null;
    }
}

// 生成分组操作按钮
function getGroupActions(groupId) {
    if (!isEditMode) return '';
    
    return `
        <div class="group-actions">
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
            ${escapeHtml(group.name)}
            ${group.is_private ? 
                `<i class="fas fa-lock group-privacy-icon" title="隐藏分组"></i>` : 
                (isEditMode ? `<i class="fas fa-lock-open group-privacy-icon" title="公开分组"></i>` : '')
            }
        </div>
    `;
}

// 生成链接卡片
function getLinkCard(link) {
    const safeUrl = safeHttpUrl(link.url);
    const iconSrc = safeHttpUrl(link.logo, '#');
    const defaultIcon = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="12" fill="#4299e1" opacity="0.1"/>
            <path fill="#4299e1" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
    `.trim());

    return `
        <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer"
           class="link-card ${isEditMode ? 'is-draggable' : ''}"
           data-link-id="${link.id}"
           data-group-id="${link.group_id}"
           ${isEditMode ? 'draggable="true"' : ''}>
            ${isEditMode ? '<span class="drag-handle" title="拖动排序"><i class="fas fa-grip-vertical"></i></span>' : ''}
            <div class="link-info">
                <div class="link-icon">
                    <img src="${escapeHtml(iconSrc)}" 
                        data-url="${escapeHtml(safeUrl)}"
                        alt="${escapeHtml(link.name)}" 
                        ${!link.logo ? 'data-auto-icon="true"' : ''}
                        onerror="this.onerror=null; this.src='data:image/svg+xml,${defaultIcon}';">
                </div>
                <div class="link-text">
                    <span class="link-title">
                        ${escapeHtml(link.name)}
                    </span>
                    <div class="link-description">${escapeHtml(link.description || '')}</div>
                </div>
            </div>
            ${isEditMode ? `
                <div class="link-actions" onclick="event.preventDefault();">
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
