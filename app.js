// ======= 全局状态 =======
var currentQuestion = 0;
var answers = {};       // { "0": "left", "3": "right", ... }

// ======= 存储管理 (IndexedDB, 更大空间) =======
var _cache = {};

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('NailongTI', 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('types')) {
        db.createObjectStore('types');
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

async function initStorage() {
  var db = await openDB();
  var oldData = localStorage.getItem('nailong-ti-custom');
  var hasOldData = false;
  if (oldData) {
    var parsed = JSON.parse(oldData);
    for (var code in parsed) {
      var data = parsed[code];
      if (data.image || data.name || data.desc) {
        var tx = db.transaction('types', 'readwrite');
        tx.objectStore('types').put(data, code);
        hasOldData = true;
      }
    }
    localStorage.removeItem('nailong-ti-custom');
  }
  var tx = db.transaction('types', 'readonly');
  var all = tx.objectStore('types').getAll();
  var keys = tx.objectStore('types').getAllKeys();
  await Promise.all([new Promise(function(r) { all.onsuccess = function() { r(); }; }),
                     new Promise(function(r) { keys.onsuccess = function() { r(); }; })]);
  _cache = {};
  for (var i = 0; i < (keys.result || []).length; i++) {
    _cache[keys.result[i]] = all.result[i];
  }
  if (hasOldData) renderAdminList();
}

function dbWrite(code, data) {
  return new Promise(function(resolve) {
    var req = indexedDB.open('NailongTI', 1);
    req.onsuccess = function(e) {
      var db = e.target.result;
      var tx = db.transaction('types', 'readwrite');
      tx.objectStore('types').put(data, code);
      tx.oncomplete = function() { db.close(); resolve(); };
    };
  });
}

function dbDeleteKey(code) {
  return new Promise(function(resolve) {
    var req = indexedDB.open('NailongTI', 1);
    req.onsuccess = function(e) {
      var db = e.target.result;
      var tx = db.transaction('types', 'readwrite');
      tx.objectStore('types').delete(code);
      tx.oncomplete = function() { db.close(); resolve(); };
    };
  });
}

var CustomStorage = {
  getCache: function() { return _cache; },
  getTypeData: function(code) { return _cache[code] || {}; },

  saveImage: async function(code, dataUrl) {
    var existing = _cache[code] || {};
    existing.image = dataUrl;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  saveName: async function(code, name) {
    var existing = _cache[code] || {};
    existing.name = name;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  saveDesc: async function(code, desc) {
    var existing = _cache[code] || {};
    existing.desc = desc;
    _cache[code] = existing;
    await dbWrite(code, existing);
  },

  deleteImage: async function(code) {
    var existing = _cache[code];
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

  getUsage: async function() {
    var total = 0;
    for (var key in _cache) {
      total += JSON.stringify(_cache[key]).length * 2;
    }
    return total;
  }
};

// ======= URL Hash 持久化（兼容所有浏览器，包括微信） =======
function saveToHash(scores) {
  var parts = ['EI', 'NS', 'TF', 'JP'].map(function(d) {
    return scores[DIM_MAP[d].leftCode] + ',' + scores[DIM_MAP[d].rightCode];
  });
  try { window.location.hash = 'r=' + parts.join('|'); } catch (e) {}
}

function loadFromHash() {
  try {
    var h = window.location.hash;
    if (!h || h.indexOf('r=') !== 1) return null;
    var parts = h.substring(3).split('|');
    var keys = ['EI', 'NS', 'TF', 'JP'];
    var scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };
    for (var i = 0; i < parts.length; i++) {
      var vals = parts[i].split(',');
      var d = DIM_MAP[keys[i]];
      scores[d.leftCode] = parseInt(vals[0]) || 0;
      scores[d.rightCode] = parseInt(vals[1]) || 0;
    }
    var typeStr = '';
    ['EI', 'NS', 'TF', 'JP'].forEach(function(dimKey) {
      var d = DIM_MAP[dimKey];
      typeStr += scores[d.leftCode] >= scores[d.rightCode] ? d.leftCode : d.rightCode;
    });
    return { t: typeStr, s: scores };
  } catch (e) { return null; }
}

function clearHash() {
  try {
    history.replaceState ? history.replaceState(null, '', location.pathname + location.search) : (location.hash = '');
  } catch (e) {}
}

// ======= DOM =======
function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', async function() {
  var isOnline = window.location.protocol !== 'file:';
  try {
    var hasAdminParam = false;
    if (window.URLSearchParams) {
      hasAdminParam = new URLSearchParams(window.location.search).get('admin') === '1';
    }
    if (isOnline && !hasAdminParam) {
      var btn = document.getElementById('admin-nav-btn');
      if (btn) btn.style.display = 'none';
    }
  } catch (e) { /* ignore */ }
  try {
    await initStorage();
  } catch (e) {
    console.warn('存储初始化失败，继续以只读模式运行', e);
    _cache = {};
  }
  initNavigation();
  bindStartButton();
  try { renderAdminList(); } catch (e) {}

  // 从 URL hash 恢复结果（微信浏览器防刷新）
  var saved = loadFromHash();
  if (saved && saved.t) {
    renderResult(saved.t, saved.s);
  }
});

// ======= 导航 =======
function initNavigation() {
  var btns = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function() {
      var page = this.dataset.page;
      showPage(page);
      if (page === 'admin') { renderAdminList(); }
    });
  }
}

function showPage(page) {
  var map = {
    home: 'page-home',
    admin: 'page-admin',
    quiz: 'page-quiz',
    result: 'page-result'
  };
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) { pages[i].classList.remove('active'); }
  $(map[page]).classList.add('active');
  var btns = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('active'); }
  var nb = document.querySelector('.nav-btn[data-page="' + page + '"]');
  if (nb) nb.classList.add('active');
}

// ======= 首页 =======
function bindStartButton() {
  $('start-btn').addEventListener('click', startQuiz);
  $('retest-btn').addEventListener('click', function() {
    currentQuestion = 0;
    for (var k in answers) delete answers[k];
    clearHash();
    showPage('home');
  });
}

// ======= 答题引擎 =======
function startQuiz() {
  currentQuestion = 0;
  for (var k in answers) delete answers[k];
  clearHash();
  showPage('quiz');
  renderQuestion();
}

function renderQuestion() {
  var q = QUESTIONS[currentQuestion];
  var total = QUESTIONS.length;

  $('progress-fill').style.width = ((currentQuestion + 1) / total * 100) + '%';
  $('progress-text').textContent = (currentQuestion + 1) + ' / ' + total;

  $('question-text').textContent = q.q;

  var container = $('options-container');
  container.innerHTML = '';

  var leftBtn = document.createElement('button');
  leftBtn.className = 'option-btn';
  leftBtn.innerHTML = '<span class="option-key">A</span> ' + q.left;
  leftBtn.addEventListener('click', function() { answerQuestion('left'); });

  var rightBtn = document.createElement('button');
  rightBtn.className = 'option-btn';
  rightBtn.innerHTML = '<span class="option-key">B</span> ' + q.right;
  rightBtn.addEventListener('click', function() { answerQuestion('right'); });

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
  var scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };

  for (var i = 0; i < QUESTIONS.length; i++) {
    var q = QUESTIONS[i];
    var side = answers[i];
    var dim = DIM_MAP[q.dim];
    var code = side === 'left' ? dim.leftCode : dim.rightCode;
    scores[code]++;
  }

  var typeStr = '';
  var dimKeys = ['EI', 'NS', 'TF', 'JP'];
  for (var i = 0; i < dimKeys.length; i++) {
    var d = DIM_MAP[dimKeys[i]];
    typeStr += scores[d.leftCode] >= scores[d.rightCode] ? d.leftCode : d.rightCode;
  }

  saveToHash(scores);
  renderResult(typeStr, scores);
}

function renderResult(typeStr, scores) {
  var typeInfo = TYPE_DATA[typeStr] || { name: '未知', desc: '暂无描述', color: '#999' };
  var saved = CustomStorage.getTypeData(typeStr);
  var imgData = saved.image || null;
  var customName = saved.name || typeInfo.name;
  var customDesc = saved.desc || typeInfo.desc;

  $('result-type').textContent = typeStr;
  $('result-dragon-name').textContent = customName;

  var imgContainer = $('result-image');
  if (imgData) {
    imgContainer.innerHTML = '<img src="' + imgData + '" alt="' + customName + '">';
  } else {
    imgContainer.innerHTML = '<div class="image-placeholder">🐉</div>';
  }

  $('result-desc').textContent = customDesc;

  var dims = [
    { id: 'dim-ei', left: scores.E, right: scores.I },
    { id: 'dim-ns', left: scores.N, right: scores.S },
    { id: 'dim-tf', left: scores.T, right: scores.F },
    { id: 'dim-jp', left: scores.J, right: scores.P }
  ];
  for (var i = 0; i < dims.length; i++) {
    var d = dims[i];
    var total = d.left + d.right || 1;
    var pct = (d.left / total) * 100;
    $(d.id).style.width = pct + '%';
  }

  showPage('result');
}

// ======= 管理页 =======
async function renderAdminList() {
  var container = $('admin-list');
  container.innerHTML = '';

  var usage = await CustomStorage.getUsage();
  var usageMB = (usage / 1024 / 1024).toFixed(1);
  var limitMB = 50;
  var pct = Math.min(100, (usage / (limitMB * 1024 * 1024)) * 100);
  var storageInfo = document.createElement('div');
  storageInfo.style.cssText = 'background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;margin-bottom:16px;color:white;';
  storageInfo.innerHTML = '\
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">\
      <span>存储空间 (IndexedDB)</span>\
      <span>' + usageMB + 'MB / ' + limitMB + 'MB</span>\
    </div>\
    <div style="width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;overflow:hidden;">\
      <div style="width:' + pct + '%;height:100%;background:' + (pct > 80 ? '#f44336' : '#4CAF50') + ';border-radius:3px;transition:width 0.3s;"></div>\
    </div>';
  container.appendChild(storageInfo);

  var ioDiv = document.createElement('div');
  ioDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
  ioDiv.innerHTML = '\
    <button id="export-btn" style="flex:1;padding:10px;background:#4CAF50;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📤 导出数据</button>\
    <button id="import-btn" style="flex:1;padding:10px;background:#FF9800;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📥 导入数据</button>';
  container.appendChild(ioDiv);
  $('export-btn').addEventListener('click', exportData);
  $('import-btn').addEventListener('click', importData);

  var allCodes = Object.keys(TYPE_DATA);
  for (var ci = 0; ci < allCodes.length; ci++) {
    (function(code) {
    var info = TYPE_DATA[code];
    var saved = CustomStorage.getTypeData(code);
    var imgSrc = saved.image || null;

    var card = document.createElement('div');
    card.className = 'admin-card';

    card.innerHTML = '\
      <div class="type-code">' + code + '</div>\
      <div class="preview-img" data-code="' + code + '" style="position:relative;">\
        ' + (imgSrc ? '<img src="' + imgSrc + '">' : '📷') + '\
      </div>\
      <div class="admin-fields">\
        <input class="admin-name" data-code="' + code + '" value="' + (saved.name || info.name) + '" placeholder="奶龙名字">\
        <textarea class="admin-desc" data-code="' + code + '" placeholder="描述文字...">' + (saved.desc || info.desc) + '</textarea>\
        ' + (imgSrc ? '<button class="clear-img-btn" data-code="' + code + '">删除图片</button>' : '') + '\
      </div>';

    var preview = card.querySelector('.preview-img');
    preview.addEventListener('click', function() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('图片太大了！请选择 5MB 以内的图片。');
          return;
        }
        compressImage(file, 150, 70, async function(dataUrl) {
          await CustomStorage.saveImage(code, dataUrl);
          renderAdminList();
        });
      });
      input.click();
    });

    var nameInput = card.querySelector('.admin-name');
    nameInput.addEventListener('change', function() {
      CustomStorage.saveName(code, nameInput.value);
    });

    var descInput = card.querySelector('.admin-desc');
    descInput.addEventListener('change', function() {
      CustomStorage.saveDesc(code, descInput.value);
    });

    var clearBtn = card.querySelector('.clear-img-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        CustomStorage.deleteImage(code);
        renderAdminList();
      });
    }

    container.appendChild(card);
    })(allCodes[ci]);
  }
}

// ======= 导出/导入工具 =======
async function exportData() {
  var allTypes = Object.keys(TYPE_DATA);
  var data = {};
  for (var i = 0; i < allTypes.length; i++) {
    var code = allTypes[i];
    var saved = CustomStorage.getTypeData(code);
    if (saved.image || saved.name || (saved.desc && saved.desc !== TYPE_DATA[code].desc)) {
      data[code] = saved;
    }
  }
  var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'nailong-ti-backup.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('✅ 数据已导出，请打开线上网页导入');
}

async function importData() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.addEventListener('change', async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var text = await file.text();
    var data = JSON.parse(text);
    var count = 0;
    for (var code in data) {
      var saved = data[code];
      if (saved.image) { await CustomStorage.saveImage(code, saved.image); count++; }
      if (saved.name) { await CustomStorage.saveName(code, saved.name); }
      if (saved.desc) { await CustomStorage.saveDesc(code, saved.desc); }
    }
    renderAdminList();
    alert('✅ 导入完成！已导入 ' + count + ' 张图片');
  });
  input.click();
}

// ======= 图片压缩工具 =======
function compressImage(file, maxWidth, quality, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var w = img.width, h = img.height;
      if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
