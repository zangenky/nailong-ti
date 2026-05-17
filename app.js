// ======= 全局状态 =======
let currentQuestion = 0;
const answers = {};       // { "0": "left", "3": "right", ... }

// ======= 存储管理 (IndexedDB, 更大空间) =======
let _cache = {};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('NailongTI', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('types')) {
        db.createObjectStore('types');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function initStorage() {
  const db = await openDB();
  // 迁移旧 localStorage 数据
  const oldData = localStorage.getItem('nailong-ti-custom');
  let hasOldData = false;
  if (oldData) {
    const parsed = JSON.parse(oldData);
    for (const [code, data] of Object.entries(parsed)) {
      if (data.image || data.name || data.desc) {
        const tx = db.transaction('types', 'readwrite');
        tx.objectStore('types').put(data, code);
        hasOldData = true;
      }
    }
    localStorage.removeItem('nailong-ti-custom');
  }
  // 加载所有数据到内存缓存（同步访问）
  const tx = db.transaction('types', 'readonly');
  const all = tx.objectStore('types').getAll();
  const keys = tx.objectStore('types').getAllKeys();
  await Promise.all([new Promise(r => { all.onsuccess = () => r(); }),
                     new Promise(r => { keys.onsuccess = () => r(); })]);
  _cache = {};
  for (let i = 0; i < (keys.result || []).length; i++) {
    _cache[keys.result[i]] = all.result[i];
  }
  if (hasOldData) renderAdminList();
}

function dbWrite(code, data) {
  return new Promise((resolve) => {
    const req = indexedDB.open('NailongTI', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('types', 'readwrite');
      tx.objectStore('types').put(data, code);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
}

function dbDeleteKey(code) {
  return new Promise((resolve) => {
    const req = indexedDB.open('NailongTI', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('types', 'readwrite');
      tx.objectStore('types').delete(code);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
}

const CustomStorage = {
  getCache() { return _cache; },
  getTypeData(code) { return _cache[code] || {}; },

  async saveImage(code, dataUrl) {
    const existing = _cache[code] || {};
    existing.image = dataUrl;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  async saveName(code, name) {
    const existing = _cache[code] || {};
    existing.name = name;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  async saveDesc(code, desc) {
    const existing = _cache[code] || {};
    existing.desc = desc;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  async deleteImage(code) {
    const existing = _cache[code];
    if (existing) {
      delete existing.image;
      if (Object.keys(existing).length === 0) {
        delete _cache[code];
        await dbDeleteKey(code);
      } else {
        _cache[code] = existing;
        await dbWrite(code, existing);
      }
    }
  },

  async getUsage() {
    let total = 0;
    for (const val of Object.values(_cache)) {
      total += JSON.stringify(val).length * 2;
    }
    return total;
  }
};

// ======= DOM =======
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  initNavigation();
  bindStartButton();
  renderAdminList();
});

// ======= 导航 =======
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
      if (page === 'admin') renderAdminList();
    });
  });
}

function showPage(page) {
  const map = {
    home: 'page-home',
    admin: 'page-admin',
    quiz: 'page-quiz',
    result: 'page-result'
  };
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(map[page]).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (nb) nb.classList.add('active');
}

// ======= 首页 =======
function bindStartButton() {
  $('start-btn').addEventListener('click', startQuiz);
  $('retest-btn').addEventListener('click', () => {
    currentQuestion = 0;
    for (const k in answers) delete answers[k];
    showPage('home');
  });
}

// ======= 答题引擎 =======
function startQuiz() {
  currentQuestion = 0;
  for (const k in answers) delete answers[k];
  showPage('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = QUESTIONS[currentQuestion];
  const total = QUESTIONS.length;

  $('progress-fill').style.width = `${((currentQuestion + 1) / total) * 100}%`;
  $('progress-text').textContent = `${currentQuestion + 1} / ${total}`;

  const dim = DIMENSIONS.find(d => d.key === q.dim);
  $('dimension-tag').textContent = `${dim.left} vs ${dim.right}`;

  $('question-text').textContent = q.q;

  const container = $('options-container');
  container.innerHTML = '';

  // 左选项（对应 leftCode，如 E/N/T/J）
  const leftBtn = document.createElement('button');
  leftBtn.className = 'option-btn';
  leftBtn.innerHTML = `<span class="option-key">A</span> ${q.left}`;
  leftBtn.addEventListener('click', () => answerQuestion('left'));

  // 右选项（对应 rightCode，如 I/S/F/P）
  const rightBtn = document.createElement('button');
  rightBtn.className = 'option-btn';
  rightBtn.innerHTML = `<span class="option-key">B</span> ${q.right}`;
  rightBtn.addEventListener('click', () => answerQuestion('right'));

  container.appendChild(leftBtn);
  container.appendChild(rightBtn);
}

function answerQuestion(side) {
  answers[currentQuestion] = side;
  currentQuestion++;

  if (currentQuestion >= QUESTIONS.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

// ======= 结果计算 =======
function showResult() {
  const scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };

  QUESTIONS.forEach((q, i) => {
    const side = answers[i];
    const dim = DIM_MAP[q.dim];
    const code = side === 'left' ? dim.leftCode : dim.rightCode;
    scores[code]++;
  });

  let typeStr = '';
  ['EI', 'NS', 'TF', 'JP'].forEach(dimKey => {
    const d = DIM_MAP[dimKey];
    const left = scores[d.leftCode];
    const right = scores[d.rightCode];
    typeStr += left >= right ? d.leftCode : d.rightCode;
  });

  renderResult(typeStr, scores);
}

function renderResult(typeStr, scores) {
  const typeInfo = TYPE_DATA[typeStr] || { name: '未知', desc: '暂无描述', color: '#999' };
  const saved = CustomStorage.getTypeData(typeStr);
  const imgData = saved.image || null;
  const customName = saved.name || typeInfo.name;
  const customDesc = saved.desc || typeInfo.desc;

  $('result-type').textContent = typeStr;
  $('result-dragon-name').textContent = `也就是 "${customName}"`;

  const imgContainer = $('result-image');
  if (imgData) {
    imgContainer.innerHTML = `<img src="${imgData}" alt="${customName}">`;
  } else {
    imgContainer.innerHTML = `<div class="image-placeholder">🐉</div>`;
  }

  $('result-desc').textContent = customDesc;

  // 维度条
  const dims = [
    { id: 'dim-ei', left: scores.E, right: scores.I },
    { id: 'dim-ns', left: scores.N, right: scores.S },
    { id: 'dim-tf', left: scores.T, right: scores.F },
    { id: 'dim-jp', left: scores.J, right: scores.P }
  ];
  dims.forEach(d => {
    const total = d.left + d.right || 1;
    const pct = (d.left / total) * 100;
    $(d.id).style.width = `${pct}%`;
  });

  showPage('result');
}

// ======= 管理页 =======
function renderAdminList() {
  const container = $('admin-list');
  container.innerHTML = '';

  // 显示存储用量
  CustomStorage.getUsage().then(usage => {
    const usageMB = (usage / 1024 / 1024).toFixed(1);
    const limitMB = 50;
    const pct = Math.min(100, (usage / (limitMB * 1024 * 1024)) * 100);
    const storageInfo = document.createElement('div');
    storageInfo.style.cssText = 'background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;margin-bottom:16px;color:white;';
    storageInfo.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>存储空间 (IndexedDB)</span>
        <span>${usageMB}MB / ${limitMB}MB</span>
      </div>
      <div style="width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${pct > 80 ? '#f44336' : '#4CAF50'};border-radius:3px;transition:width 0.3s;"></div>
      </div>
    `;
    container.appendChild(storageInfo);
  });

  const allCodes = Object.keys(TYPE_DATA);
  allCodes.forEach(code => {
    const info = TYPE_DATA[code];
    const saved = CustomStorage.getTypeData(code);
    const imgSrc = saved.image || null;

    const card = document.createElement('div');
    card.className = 'admin-card';

    card.innerHTML = `
      <div class="type-code">${code}</div>
      <div class="preview-img" data-code="${code}" style="position:relative;">
        ${imgSrc ? `<img src="${imgSrc}">` : '📷'}
      </div>
      <div class="admin-fields">
        <input class="admin-name" data-code="${code}" value="${saved.name || info.name}" placeholder="奶龙名字">
        <textarea class="admin-desc" data-code="${code}" placeholder="描述文字...">${saved.desc || info.desc}</textarea>
        ${imgSrc ? `<button class="clear-img-btn" data-code="${code}">删除图片</button>` : ''}
      </div>
    `;

    // 点击图片上传（自动压缩）
    const preview = card.querySelector('.preview-img');
    preview.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('图片太大了！请选择 5MB 以内的图片。');
          return;
        }
        compressImage(file, 150, 70, async (dataUrl) => {
          await CustomStorage.saveImage(code, dataUrl);
          renderAdminList();
        });
      });
      input.click();
    });

    // 名字变更
    const nameInput = card.querySelector('.admin-name');
    nameInput.addEventListener('change', () => {
      CustomStorage.saveName(code, nameInput.value);
    });

    // 描述变更
    const descInput = card.querySelector('.admin-desc');
    descInput.addEventListener('change', () => {
      CustomStorage.saveDesc(code, descInput.value);
    });

    // 删除图片
    const clearBtn = card.querySelector('.clear-img-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        CustomStorage.deleteImage(code);
        renderAdminList();
      });
    }

    container.appendChild(card);
  });
}

// ======= 图片压缩工具 =======
function compressImage(file, maxWidth, quality, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
