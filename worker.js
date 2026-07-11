function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Base64 编码
function base64Encode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Base64 解码
function base64Decode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// 生成 JWT token
async function generateToken(env) {
  // 简单的 payload
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24小时过期
    iat: Math.floor(Date.now() / 1000), // 签发时间
    admin: true
  };

  // 编码 payload
  const encodedPayload = base64Encode(JSON.stringify(payload));
  
  // 使用密钥签名
  const signature = base64Encode(env.JWT_SECRET + encodedPayload);
  
  // 返回 token
  return `${encodedPayload}.${signature}`;
}

// 验证 JWT token
async function verifyToken(token, env) {
  try {
    // 分割 payload 和签名
    const [encodedPayload, signature] = token.split('.');

    // 验证签名是否匹配
    const expectedSignature = base64Encode(env.JWT_SECRET + encodedPayload);
    if (signature !== expectedSignature) {
      return false;
    }

    // 解码 payload
    const payload = JSON.parse(base64Decode(encodedPayload));

    // 检查是否过期
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return payload.admin === true;
  } catch (error) {
    return false;
  }
}

// 验证管理员权限
async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.split(' ')[1];
  return await verifyToken(token, env);
}

// 处理登录请求
async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return new Response('方法不允许', { status: 405 });
  }

  const { password } = await request.json();
  if (password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }

  const token = await generateToken(env);
  return new Response(JSON.stringify({ token }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

// 处理 token 验证请求
async function handleVerify(request, env) {
  const isAdmin = await verifyAdmin(request, env);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'token无效' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
  return new Response(JSON.stringify({ valid: true }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

async function handleGroups(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const id = path.match(/\/api\/groups\/(\d+)/)?.[1];
  const isAdmin = await verifyAdmin(request, env);

  const headers = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/groups - 获取所有分组
    if (request.method === 'GET' && path === '/api/groups') {
      let query = 'SELECT * FROM Groups';
      if (!isAdmin) {
        query += ' WHERE is_private = FALSE';
      }
      query += ' ORDER BY order_num ASC';

      const groups = await env.DB.prepare(query).all();
      return new Response(JSON.stringify(groups.results), { headers });
    }

    // 以下操作需要管理员权限
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), {
        status: 401,
        headers
      });
    }

    // POST /api/groups - 创建新分组
    if (request.method === 'POST' && path === '/api/groups') {
      const { name, order_num, is_private } = await request.json();
      
      const result = await env.DB.prepare(
        'INSERT INTO Groups (name, order_num, is_private) VALUES (?, ?, ?)'
      ).bind(name, order_num || 0, is_private || false)
        .run();

      return new Response(JSON.stringify({
        id: result.lastRowId,
        name,
        order_num,
        is_private
      }), { headers });
    }

    // 需要ID的操作
    if (!id) {
      return new Response('缺少ID参数', { status: 400, headers });
    }

    // PUT /api/groups/:id - 更新分组
    if (request.method === 'PUT') {
      const { name, order_num, is_private } = await request.json();
      
      await env.DB.prepare(
        'UPDATE Groups SET name = ?, order_num = ?, is_private = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(name, order_num || 0, is_private || false, id)
        .run();

      return new Response(JSON.stringify({
        id: parseInt(id),
        name,
        order_num: order_num || 0,
        is_private
      }), { headers });
    }

    // DELETE /api/groups/:id - 删除分组
    if (request.method === 'DELETE') {
      // 开始一个事务
      await env.DB.prepare('BEGIN').run();
      
      try {
        // 获取要删除的分组的 order_num
        const group = await env.DB.prepare('SELECT order_num FROM Groups WHERE id = ?')
          .bind(id)
          .first();
        
        if (!group) {
          throw new Error('分组不存在');
        }

        // 删除分组内的所有链接
        await env.DB.prepare('DELETE FROM Links WHERE group_id = ?')
          .bind(id)
          .run();

        // 删除分组
        await env.DB.prepare('DELETE FROM Groups WHERE id = ?')
          .bind(id)
          .run();

        // 更新其他分组的序号
        await env.DB.prepare(`
          UPDATE Groups 
          SET order_num = order_num - 1 
          WHERE order_num > ?
        `).bind(group.order_num)
          .run();

        // 提交事务
        await env.DB.prepare('COMMIT').run();

        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error) {
        // 如果出错，回滚事务
        await env.DB.prepare('ROLLBACK').run();
        throw error;
      }
    }

    return new Response('方法不允许', { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers 
    });
  }
}

async function handleLinks(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const id = path.match(/\/api\/links\/(\d+)/)?.[1];
  const groupId = url.searchParams.get('group_id');
  const isAdmin = await verifyAdmin(request, env);

  const headers = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/links - 获取所有链接
    if (request.method === 'GET' && path === '/api/links') {
      let query = `
        SELECT Links.*, Groups.name as group_name 
        FROM Links 
        LEFT JOIN Groups ON Links.group_id = Groups.id
      `;
      
      const params = [];
      const conditions = [];

      if (!isAdmin) {
        conditions.push('Groups.is_private = FALSE');
      }
      
      if (groupId) {
        conditions.push('Links.group_id = ?');
        params.push(groupId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY Links.order_num ASC';

      const links = await env.DB.prepare(query)
        .bind(...params)
        .all();

      return new Response(JSON.stringify(links.results), { headers });
    }

    // 以下操作需要管理员权限
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), {
        status: 401,
        headers
      });
    }

    // POST /api/links - 创建新链接
    if (request.method === 'POST' && path === '/api/links') {
      const { name, url, logo, description, group_id, order_num } = await request.json();
      
      // 获取当前分组中的最大 order_num
      let currentMaxOrder = 0;
      if (group_id) {
        const result = await env.DB.prepare(`
          SELECT MAX(order_num) as max_order 
          FROM Links 
          WHERE group_id = ?
        `).bind(group_id).all();
        currentMaxOrder = result.results[0].max_order || 0;
      }
      
      const result = await env.DB.prepare(`
        INSERT INTO Links (name, url, logo, description, group_id, order_num) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        name,
        url,
        logo || null,
        description || null,
        group_id || null,
        order_num || (currentMaxOrder + 10)
      ).run();

      return new Response(JSON.stringify({
        id: result.lastRowId,
        name,
        url,
        logo,
        description,
        group_id,
        order_num
      }), { headers });
    }

    // 需要ID的操作
    if (!id) {
      return new Response('缺少ID参数', { status: 400, headers });
    }

    // PUT /api/links/:id - 更新链接
    if (request.method === 'PUT') {
      const { name, url, logo, description, group_id, order_num } = await request.json();
      
      await env.DB.prepare(`
        UPDATE Links 
        SET name = ?, url = ?, logo = ?, description = ?, 
            group_id = ?, order_num = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        name,
        url,
        logo || null,
        description || null,
        group_id || null,
        order_num || 0,
        id
      ).run();

      return new Response(JSON.stringify({
        id: parseInt(id),
        name,
        url,
        logo,
        description,
        group_id,
        order_num
      }), { headers });
    }

    // DELETE /api/links/:id - 删除链接
    if (request.method === 'DELETE') {
      await env.DB.prepare(
        'DELETE FROM Links WHERE id = ?'
      ).bind(id)
        .run();

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response('方法不允许', { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers 
    });
  }
}

// 抓取网页信息
async function fetchWebsiteInfo(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // 使用简单的正则表达式提取信息
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) 
      || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
    
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      description: descriptionMatch ? descriptionMatch[1].trim() : ''
    };
  } catch (error) {
    throw new Error('无法获取网页信息');
  }
}

// 处理网页信息获取请求
async function handleFetchInfo(request) {
  if (request.method !== 'POST') {
    return new Response('方法不允许', { status: 405 });
  }

  try {
    const { url } = await request.json();
    const info = await fetchWebsiteInfo(url);
    
    return new Response(JSON.stringify(info), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

async function ensureBackgroundTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS BackgroundSettings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      image_data TEXT,
      image_source TEXT,
      mode TEXT DEFAULT 'cover',
      opacity INTEGER DEFAULT 50,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

function normalizeBackgroundMode(mode) {
  return ['cover', 'contain', 'repeat'].includes(mode) ? mode : 'cover';
}

function normalizeBackgroundOpacity(opacity) {
  const value = Number.parseInt(opacity, 10);
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(sourceUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch (error) {
    throw new Error('背景图片地址无效');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('背景图片地址必须是 http 或 https');
  }

  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 BackgroundFetcher/1.0'
    }
  });

  if (!response.ok) {
    throw new Error('无法获取背景图片');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error('背景地址不是图片');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 4 * 1024 * 1024) {
    throw new Error('背景图片不能超过 4MB');
  }

  return `data:${contentType.split(';')[0]};base64,${arrayBufferToBase64(buffer)}`;
}

async function handleBackground(request, env) {
  const headers = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    await ensureBackgroundTable(env);

    if (request.method === 'GET') {
      const settings = await env.DB.prepare(
        'SELECT image_data, image_source, mode, opacity, updated_at FROM BackgroundSettings WHERE id = 1'
      ).first();

      return new Response(JSON.stringify(settings || {
        image_data: null,
        image_source: '',
        mode: 'cover',
        opacity: 50
      }), { headers });
    }

    if (request.method === 'DELETE') {
      const isAdmin = await verifyAdmin(request, env);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
          status: 401,
          headers
        });
      }

      await env.DB.prepare('DELETE FROM BackgroundSettings WHERE id = 1').run();
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const isAdmin = await verifyAdmin(request, env);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: '需要管理员权限' }), {
          status: 401,
          headers
        });
      }

      const { image_url, image_data, mode, opacity } = await request.json();
      const safeMode = normalizeBackgroundMode(mode);
      const safeOpacity = normalizeBackgroundOpacity(opacity);
      let storedImageData = image_data || '';
      let imageSource = image_url || '';

      if (storedImageData && !storedImageData.startsWith('data:image/')) {
        throw new Error('背景图片数据格式无效');
      }

      if (!storedImageData && image_url) {
        storedImageData = await fetchImageAsDataUrl(image_url);
      }

      if (!storedImageData) {
        await env.DB.prepare('DELETE FROM BackgroundSettings WHERE id = 1').run();
        return new Response(JSON.stringify({ success: true }), { headers });
      }

      await env.DB.prepare(`
        INSERT INTO BackgroundSettings (id, image_data, image_source, mode, opacity, updated_at)
        VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          image_data = excluded.image_data,
          image_source = excluded.image_source,
          mode = excluded.mode,
          opacity = excluded.opacity,
          updated_at = CURRENT_TIMESTAMP
      `).bind(storedImageData, imageSource, safeMode, safeOpacity).run();

      return new Response(JSON.stringify({
        image_data: storedImageData,
        image_source: imageSource,
        mode: safeMode,
        opacity: safeOpacity
      }), { headers });
    }

    return new Response('方法不允许', { status: 405, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/login') {
        return await handleLogin(request, env);
      } else if (path === '/api/fetch-info') {
        return await handleFetchInfo(request);
      } else if (path === '/api/verify') {
        return await handleVerify(request, env);
      } else if (path === '/api/background') {
        return await handleBackground(request, env);
      } else if (path.startsWith('/api/groups')) {
        return await handleGroups(request, env);
      } else if (path.startsWith('/api/links')) {
        return await handleLinks(request, env);
      }

      return new Response('无效的请求路径', { 
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: err.message,
        stack: err.stack
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  },
}; 
