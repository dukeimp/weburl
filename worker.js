const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:8787',
  'http://127.0.0.1:8787'
]);

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin || LOCAL_DEVELOPMENT_ORIGINS.has(origin);
}

function withStaticSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && isAllowedOrigin(request)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function securityHeaders(request, contentType = 'application/json; charset=utf-8') {
  return {
    ...corsHeaders(request),
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: securityHeaders(request) });
}

function errorResponse(request, message, status = 400) {
  return json(request, { error: message }, status);
}

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

async function generateToken(env) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({ iat: now, exp: now + TOKEN_TTL_SECONDS, admin: true }));
  const body = `${header}.${payload}`;
  return `${body}.${base64UrlEncode(await hmac(body, env.JWT_SECRET))}`;
}

async function verifyToken(token, env) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const body = `${parts[0]}.${parts[1]}`;
    const expected = new Uint8Array(await hmac(body, env.JWT_SECRET));
    const actual = base64UrlDecode(parts[2]);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
    if (difference !== 0) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    return payload.admin === true && Number.isFinite(payload.exp) && payload.exp > now;
  } catch {
    return false;
  }
}

async function verifyAdmin(request, env) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([^\s]+)$/);
  return match ? verifyToken(match[1], env) : false;
}

async function requireAdmin(request, env) {
  return await verifyAdmin(request, env) ? null : errorResponse(request, '需要管理员权限', 401);
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('请求必须使用 application/json');
  }
  return request.json();
}

function requiredText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${field}不能为空`);
  if (text.length > maxLength) throw new Error(`${field}不能超过 ${maxLength} 个字符`);
  return text;
}

function optionalText(value, field, maxLength) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (text.length > maxLength) throw new Error(`${field}不能超过 ${maxLength} 个字符`);
  return text;
}

function integer(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function publicHttpUrl(value, field = 'URL') {
  const text = requiredText(value, field, 2048);
  let url;
  try { url = new URL(text); } catch { throw new Error(`${field}无效`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${field}仅支持无凭据的 HTTP/HTTPS 地址`);
  }
  validatePublicHostname(url.hostname);
  return url;
}

function validatePublicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('不允许访问本地或内部地址');
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    if (octets.some(n => n < 0 || n > 255) || a === 0 || a === 10 || a === 127 ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || a >= 224) throw new Error('不允许访问非公网地址');
  }
  if (host.includes(':') && (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb'))) {
    throw new Error('不允许访问非公网地址');
  }
}

async function fetchPublicResource(inputUrl, maxBytes) {
  let url = publicHttpUrl(inputUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'WebURL-MetadataFetcher/2.0', 'Accept': 'text/html,image/*;q=0.8' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('目标地址重定向次数过多');
      url = publicHttpUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`目标站点返回 HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('远程内容超过大小限制');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('远程内容超过大小限制'); }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return { response, body };
  }
  throw new Error('无法获取远程内容');
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return errorResponse(request, '方法不允许', 405);
  const { password } = await readJson(request);
  if (typeof password !== 'string' || password !== env.ADMIN_PASSWORD) {
    return errorResponse(request, '密码错误', 401);
  }
  return json(request, { token: await generateToken(env), expires_in: TOKEN_TTL_SECONDS });
}

async function handleVerify(request, env) {
  return await verifyAdmin(request, env) ? json(request, { valid: true }) : errorResponse(request, '令牌无效', 401);
}

async function handleGroups(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.match(/^\/api\/groups\/(\d+)$/)?.[1];
  const isAdmin = await verifyAdmin(request, env);
  if (request.method === 'GET' && url.pathname === '/api/groups') {
    const query = `SELECT * FROM Groups ${isAdmin ? '' : 'WHERE is_private = 0'} ORDER BY order_num ASC, id ASC`;
    return json(request, (await env.DB.prepare(query).all()).results);
  }
  if (!isAdmin) return errorResponse(request, '需要管理员权限', 401);
  if (request.method === 'POST' && url.pathname === '/api/groups') {
    const body = await readJson(request);
    const name = requiredText(body.name, '分组名称', 100);
    const orderNum = integer(body.order_num);
    const isPrivate = body.is_private ? 1 : 0;
    const result = await env.DB.prepare('INSERT INTO Groups (name, order_num, is_private) VALUES (?, ?, ?)').bind(name, orderNum, isPrivate).run();
    return json(request, { id: result.meta.last_row_id, name, order_num: orderNum, is_private: !!isPrivate }, 201);
  }
  if (!id) return errorResponse(request, '无效的分组 ID', 404);
  if (request.method === 'PUT') {
    const body = await readJson(request);
    const name = requiredText(body.name, '分组名称', 100);
    const orderNum = integer(body.order_num);
    const isPrivate = body.is_private ? 1 : 0;
    const result = await env.DB.prepare('UPDATE Groups SET name=?, order_num=?, is_private=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name, orderNum, isPrivate, id).run();
    if (!result.meta.changes) return errorResponse(request, '分组不存在', 404);
    return json(request, { id: Number(id), name, order_num: orderNum, is_private: !!isPrivate });
  }
  if (request.method === 'DELETE') {
    const group = await env.DB.prepare('SELECT order_num FROM Groups WHERE id=?').bind(id).first();
    if (!group) return errorResponse(request, '分组不存在', 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM Links WHERE group_id=?').bind(id),
      env.DB.prepare('DELETE FROM Groups WHERE id=?').bind(id),
      env.DB.prepare('UPDATE Groups SET order_num=order_num-1 WHERE order_num>?').bind(group.order_num)
    ]);
    return json(request, { success: true });
  }
  return errorResponse(request, '方法不允许', 405);
}

function normalizeLink(body) {
  const name = requiredText(body.name, '链接名称', 200);
  const url = publicHttpUrl(body.url, '链接 URL').href;
  const logo = body.logo ? publicHttpUrl(body.logo, '图标 URL').href : null;
  const description = optionalText(body.description, '链接描述', 1000);
  const groupId = Number.parseInt(body.group_id, 10);
  if (!Number.isInteger(groupId) || groupId <= 0) throw new Error('请选择有效分组');
  return { name, url, logo, description, groupId, orderNum: integer(body.order_num) };
}

async function handleLinks(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.match(/^\/api\/links\/(\d+)$/)?.[1];
  const isAdmin = await verifyAdmin(request, env);
  if (request.method === 'GET' && url.pathname === '/api/links') {
    const conditions = [];
    const params = [];
    if (!isAdmin) conditions.push('Groups.is_private = 0');
    const groupId = url.searchParams.get('group_id');
    if (groupId) { conditions.push('Links.group_id = ?'); params.push(groupId); }
    const query = `SELECT Links.*, Groups.name AS group_name FROM Links JOIN Groups ON Links.group_id=Groups.id ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY Links.order_num ASC, Links.id ASC`;
    return json(request, (await env.DB.prepare(query).bind(...params).all()).results);
  }
  if (!isAdmin) return errorResponse(request, '需要管理员权限', 401);
  if (request.method === 'POST' && url.pathname === '/api/links') {
    const link = normalizeLink(await readJson(request));
    const group = await env.DB.prepare('SELECT id FROM Groups WHERE id=?').bind(link.groupId).first();
    if (!group) return errorResponse(request, '分组不存在', 400);
    if (!link.orderNum) {
      const max = await env.DB.prepare('SELECT COALESCE(MAX(order_num),0) AS value FROM Links WHERE group_id=?').bind(link.groupId).first();
      link.orderNum = max.value + 10;
    }
    const result = await env.DB.prepare('INSERT INTO Links (name,url,logo,description,group_id,order_num) VALUES (?,?,?,?,?,?)').bind(link.name, link.url, link.logo, link.description, link.groupId, link.orderNum).run();
    return json(request, { id: result.meta.last_row_id, ...link, group_id: link.groupId, order_num: link.orderNum }, 201);
  }
  if (!id) return errorResponse(request, '无效的链接 ID', 404);
  if (request.method === 'PUT') {
    const link = normalizeLink(await readJson(request));
    const result = await env.DB.prepare('UPDATE Links SET name=?,url=?,logo=?,description=?,group_id=?,order_num=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(link.name, link.url, link.logo, link.description, link.groupId, link.orderNum, id).run();
    if (!result.meta.changes) return errorResponse(request, '链接不存在', 404);
    return json(request, { id: Number(id), ...link, group_id: link.groupId, order_num: link.orderNum });
  }
  if (request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM Links WHERE id=?').bind(id).run();
    if (!result.meta.changes) return errorResponse(request, '链接不存在', 404);
    return json(request, { success: true });
  }
  return errorResponse(request, '方法不允许', 405);
}

async function handleFetchInfo(request, env) {
  if (request.method !== 'POST') return errorResponse(request, '方法不允许', 405);
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const { url } = await readJson(request);
  const { response, body } = await fetchPublicResource(url, MAX_HTML_BYTES);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) throw new Error('目标地址不是 HTML 页面');
  const html = new TextDecoder('utf-8').decode(body);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || '';
  return json(request, { title: title.slice(0, 200), description: description.trim().slice(0, 1000) });
}

async function ensureBackgroundTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS BackgroundSettings (id INTEGER PRIMARY KEY CHECK(id=1),image_data TEXT,image_source TEXT,mode TEXT DEFAULT 'cover',opacity INTEGER DEFAULT 50,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
}

async function handleBackground(request, env) {
  await ensureBackgroundTable(env);
  if (request.method === 'GET') {
    return json(request, await env.DB.prepare('SELECT image_data,image_source,mode,opacity,updated_at FROM BackgroundSettings WHERE id=1').first() || { image_data:null,image_source:'',mode:'cover',opacity:50 });
  }
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM BackgroundSettings WHERE id=1').run();
    return json(request, { success: true });
  }
  if (!['POST', 'PUT'].includes(request.method)) return errorResponse(request, '方法不允许', 405);
  const body = await readJson(request);
  const mode = ['cover','contain','repeat'].includes(body.mode) ? body.mode : 'cover';
  const opacity = Math.min(100, Math.max(0, integer(body.opacity, 50)));
  let imageData = optionalText(body.image_data, '背景图片数据', 6 * 1024 * 1024) || '';
  let imageSource = '';
  if (imageData && !/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) throw new Error('背景图片数据格式无效');
  if (!imageData && body.image_url) {
    const safeUrl = publicHttpUrl(body.image_url, '背景图片 URL');
    const fetched = await fetchPublicResource(safeUrl.href, MAX_IMAGE_BYTES);
    const type = (fetched.response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(type)) throw new Error('背景地址不是受支持的图片');
    imageData = `data:${type};base64,${bytesToBase64(fetched.body)}`;
    imageSource = safeUrl.href;
  }
  if (!imageData) {
    await env.DB.prepare('DELETE FROM BackgroundSettings WHERE id=1').run();
    return json(request, { success: true });
  }
  await env.DB.prepare(`INSERT INTO BackgroundSettings(id,image_data,image_source,mode,opacity,updated_at) VALUES(1,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET image_data=excluded.image_data,image_source=excluded.image_source,mode=excluded.mode,opacity=excluded.opacity,updated_at=CURRENT_TIMESTAMP`).bind(imageData,imageSource,mode,opacity).run();
  return json(request, { image_data:imageData,image_source:imageSource,mode,opacity });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedOrigin(request)) return errorResponse(request, '来源不允许', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/login') return await handleLogin(request, env);
      if (path === '/api/verify') return await handleVerify(request, env);
      if (path === '/api/fetch-info') return await handleFetchInfo(request, env);
      if (path === '/api/background') return await handleBackground(request, env);
      if (path === '/api/groups' || /^\/api\/groups\/\d+$/.test(path)) return await handleGroups(request, env);
      if (path === '/api/links' || /^\/api\/links\/\d+$/.test(path)) return await handleLinks(request, env);
      if (!path.startsWith('/api/')) return withStaticSecurityHeaders(await env.ASSETS.fetch(request));
      return errorResponse(request, '无效的请求路径', 404);
    } catch (error) {
      console.error('Request failed', { path, message: error.message });
      return errorResponse(request, error instanceof SyntaxError ? 'JSON 格式无效' : error.message, 400);
    }
  }
};
