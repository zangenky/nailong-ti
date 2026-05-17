// ======= 全局状态 =======
var currentQuestion = 0;
var answers = {};

// ======= 存储管理 (localStorage, 兼容微信X5) =======
var _cache = {};

function initStorage() {
  return new Promise(function(resolve) {
    _cache = {};
    // 先加载 localStorage 数据
    try {
      var oldData = localStorage.getItem('nt-cache');
      if (oldData) { _cache = JSON.parse(oldData); }
    } catch (e) {}
    // 尝试从 IndexedDB 迁移数据（旧版本用户）
    try {
      if (!window.indexedDB) { resolve(); return; }
      var req = indexedDB.open('NailongTI', 1);
      var resolved = false;
      var done = function() { if (!resolved) { resolved = true; resolve(); } };
      req.onsuccess = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('types')) { db.close(); done(); return; }
        var tx = db.transaction('types', 'readonly');
        var all = tx.objectStore('types').getAll();
        var keys = tx.objectStore('types').getAllKeys();
        var finish = function() {
          var items = [];
          for (var i = 0; i < (keys.result || []).length; i++) {
            items.push({ code: keys.result[i], data: all.result[i] });
          }
          // 异步压缩旧大图
          var idx = 0;
          var next = function() {
            if (idx >= items.length) {
              syncToLocal();
              db.close();
              done();
              return;
            }
            var item = items[idx];
            _cache[item.code] = item.data;
            // 如果图片太大，后台压缩（不阻塞）
            if (item.data && item.data.image && dataUrlSize(item.data.image) > 15000) {
              compressDataUrl(item.data.image, 120, 60, function(small) {
                item.data.image = small;
                _cache[item.code] = item.data;
                idx++; next();
              });
            } else {
              idx++; next();
            }
          };
          next();
        };
        all.onsuccess = function() {
          keys.onsuccess = function() { finish(); };
        };
        setTimeout(done, 800); // 超时保护
      };
      req.onerror = function() { done(); };
    } catch (e) { resolve(); }
  });
}

function syncToLocal() {
  try { localStorage.setItem('nt-cache', JSON.stringify(_cache)); } catch (e) {}
}

function saveData(code, updates) {
  _cache[code] = _cache[code] || {};
  for (var k in updates) { _cache[code][k] = updates[k]; }
  syncToLocal();
}

function deleteDataKey(code, key) {
  if (!_cache[code]) return;
  delete _cache[code][key];
  var hasData = false;
  for (var k in _cache[code]) { hasData = true; break; }
  if (!hasData) { delete _cache[code]; }
  syncToLocal();
}

var CustomStorage = {
  getCache: function() { return _cache; },
  getTypeData: function(code) { return _cache[code] || {}; },

  saveImage: function(code, dataUrl) {
    return new Promise(function(resolve) {
      // 自动压缩过大的图片（>15KB 解码后）
      if (dataUrlSize(dataUrl) > 15000) {
        compressDataUrl(dataUrl, 120, 60, function(smallData) {
          saveData(code, { image: smallData });
          resolve();
        });
      } else {
        saveData(code, { image: dataUrl });
        resolve();
      }
    });
  },

  saveName: function(code, name) {
    return Promise.resolve().then(function() {
      saveData(code, { name: name });
    });
  },

  saveDesc: function(code, desc) {
    return Promise.resolve().then(function() {
      saveData(code, { desc: desc });
    });
  },

  deleteImage: function(code) {
    return Promise.resolve().then(function() {
      deleteDataKey(code, 'image');
    });
  },

  getUsage: function() {
    var total = 0;
    for (var key in _cache) {
      total += JSON.stringify(_cache[key]).length * 2;
    }
    return Promise.resolve(total);
  }
};

// ======= URL Hash 持久化（微信浏览器防刷新丢失） =======
function saveToHash(scores) {
  var s = scores;
  var parts = ['EI', 'NS', 'TF', 'JP'].map(function(d) {
    return s[DIM_MAP[d].leftCode] + ',' + s[DIM_MAP[d].rightCode];
  });
  try { window.location.hash = 'r=' + parts.join('|'); } catch (e) {}
}

function loadFromHash() {
  try {
    var h = window.location.hash;
    if (!h || h.indexOf('r=') !== 1) return null;
    var parts = h.substring(3).split('|');
    if (parts.length !== 4) return null;
    var dimKeys = ['EI', 'NS', 'TF', 'JP'];
    var scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };
    for (var i = 0; i < 4; i++) {
      var vals = parts[i].split(',');
      var d = DIM_MAP[dimKeys[i]];
      scores[d.leftCode] = parseInt(vals[0]) || 0;
      scores[d.rightCode] = parseInt(vals[1]) || 0;
    }
    var typeStr = '';
    for (var i = 0; i < 4; i++) {
      var d = DIM_MAP[dimKeys[i]];
      typeStr += scores[d.leftCode] >= scores[d.rightCode] ? d.leftCode : d.rightCode;
    }
    return { t: typeStr, s: scores };
  } catch (e) { return null; }
}

function clearHash() {
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else { window.location.hash = ''; }
  } catch (e) {}
}

// ======= DOM =======
function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', function() {
  initStorage().then(function() {
    // 线上版通过 ?admin=1 参数显示管理按钮
    try {
      var isOnline = window.location.protocol !== 'file:';
      var hasAdmin = window.location.search.indexOf('admin=1') >= 0;
      if (isOnline && !hasAdmin) {
        var btn = document.getElementById('admin-nav-btn');
        if (btn) btn.style.display = 'none';
      }
    } catch (e) {}

    initNavigation();
    bindStartButton();
    try { renderAdminList(); } catch (e) {}

    // 从 URL hash 恢复结果
    var saved = loadFromHash();
    if (saved && saved.t) {
      renderResult(saved.t, saved.s);
    }
  });
});

// ======= 导航 =======
function initNavigation() {
  var btns = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function() {
      var page = this.getAttribute('data-page');
      showPage(page);
      if (page === 'admin') { renderAdminList(); }
    });
  }
}

function showPage(page) {
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) { pages[i].classList.remove('active'); }
  var target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

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
  for (var i = 0; i < 4; i++) {
    var d = DIM_MAP[dimKeys[i]];
    typeStr += scores[d.leftCode] >= scores[d.rightCode] ? d.leftCode : d.rightCode;
  }
  saveToHash(scores);
  renderResult(typeStr, scores);
}

function renderResult(typeStr, scores) {
  var typeInfo = TYPE_DATA[typeStr] || { name: '未知', desc: '暂无描述', color: '#999' };
  var saved = CustomStorage.getTypeData(typeStr);
  var imgData = saved.image || typeInfo.image || null;
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
    { id: 'dim-ei', l: scores.E, r: scores.I },
    { id: 'dim-ns', l: scores.N, r: scores.S },
    { id: 'dim-tf', l: scores.T, r: scores.F },
    { id: 'dim-jp', l: scores.J, r: scores.P }
  ];
  for (var i = 0; i < dims.length; i++) {
    var d = dims[i];
    var total = d.l + d.r || 1;
    $(d.id).style.width = (d.l / total * 100) + '%';
  }

  showPage('result');
}

// ======= 管理页 =======
async function renderAdminList() {
  var container = $('admin-list');
  container.innerHTML = '';

  var usage = await CustomStorage.getUsage();
  var usageMB = (usage / 1024 / 1024).toFixed(1);
  var pct = Math.min(100, (usage / (5 * 1024 * 1024)) * 100);
  var storageInfo = document.createElement('div');
  var warnColor = pct > 90 ? '#f44336' : (pct > 70 ? '#FF9800' : '#4CAF50');
  storageInfo.style.cssText = 'background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;margin-bottom:16px;color:white;';
  storageInfo.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">'
    + '<span>存储空间 (localStorage)</span><span>' + usageMB + 'MB / 5MB</span></div>'
    + '<div style="width:100%;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;overflow:hidden;">'
    + '<div style="width:' + pct + '%;height:100%;background:' + warnColor + ';border-radius:3px;transition:width 0.3s;"></div></div>'
    + (pct > 80 ? '<div style="font-size:12px;color:#ffcdd2;margin-top:4px;">⚠️ 存储空间不足，部分图片可能无法保存。请重新导出后导入以压缩图片。</div>' : '');
  container.appendChild(storageInfo);

  var ioDiv = document.createElement('div');
  ioDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
  ioDiv.innerHTML = '<button id="export-btn" style="flex:1;padding:10px;background:#4CAF50;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📤 导出数据</button>'
    + '<button id="import-btn" style="flex:1;padding:10px;background:#FF9800;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📥 导入数据</button>';
  container.appendChild(ioDiv);
  $('export-btn').addEventListener('click', exportData);
  $('import-btn').addEventListener('click', importData);

  var allCodes = Object.keys(TYPE_DATA);
  for (var ci = 0; ci < allCodes.length; ci++) {
    (function(code) {
      var info = TYPE_DATA[code];
      var saved = CustomStorage.getTypeData(code);
      var imgSrc = saved.image || info.image || null;

      var card = document.createElement('div');
      card.className = 'admin-card';

      card.innerHTML = '<div class="type-code">' + code + '</div>'
        + '<div class="preview-img" style="position:relative;">'
        + (imgSrc ? '<img src="' + imgSrc + '">' : '📷')
        + '</div>'
        + '<div class="admin-fields">'
        + '<input class="admin-name" value="' + (saved.name || info.name) + '" placeholder="奶龙名字">'
        + '<textarea class="admin-desc" placeholder="描述文字...">' + (saved.desc || info.desc) + '</textarea>'
        + (imgSrc ? '<button class="clear-img-btn">删除图片</button>' : '')
        + '</div>';

      card.querySelector('.preview-img').addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { alert('图片太大了！请选择 5MB 以内的图片。'); return; }
          compressImage(file, 120, 60, function(dataUrl) {
            CustomStorage.saveImage(code, dataUrl).then(function() { renderAdminList(); });
          });
        });
        input.click();
      });

      card.querySelector('.admin-name').addEventListener('change', function() {
        CustomStorage.saveName(code, this.value);
      });

      card.querySelector('.admin-desc').addEventListener('change', function() {
        CustomStorage.saveDesc(code, this.value);
      });

      var clearBtn = card.querySelector('.clear-img-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          CustomStorage.deleteImage(code).then(function() { renderAdminList(); });
        });
      }

      container.appendChild(card);
    })(allCodes[ci]);
  }
}

// ======= 导出/导入工具 =======
function exportData() {
  var data = {};
  for (var code in _cache) {
    var saved = _cache[code];
    if (saved.image || saved.name || saved.desc) {
      data[code] = saved;
    }
  }
  var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'nailong-ti-backup.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  alert('✅ 数据已导出');
}

function importData() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var codes = [];
        for (var k in data) codes.push(k);
        if (codes.length === 0) { renderAdminList(); alert('✅ 导入完成'); return; }
        var idx = 0;
        var total = codes.length;
        var imgCount = 0;
        var next = function() {
          if (idx >= total) {
            renderAdminList();
            alert('✅ 导入完成！已导入 ' + imgCount + ' 张图片');
            return;
          }
          var code = codes[idx];
          var saved = data[code];
          var promises = [];
          if (saved.image) {
            (function(c, imgData) {
              compressDataUrl(imgData, 120, 60, function(smallData) {
                CustomStorage.saveImage(c, smallData).then(function() {
                  imgCount++;
                  if (saved.name) CustomStorage.saveName(c, saved.name);
                  if (saved.desc) CustomStorage.saveDesc(c, saved.desc);
                  idx++; next();
                });
              });
            })(code, saved.image);
          } else {
            if (saved.name) CustomStorage.saveName(code, saved.name);
            if (saved.desc) CustomStorage.saveDesc(code, saved.desc);
            idx++; next();
          }
        };
        next();
      } catch (err) { alert('导入失败：文件格式错误'); }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ======= 图片压缩工具 =======
function compressImage(file, maxWidth, quality, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      compressImgToDataUrl(img, maxWidth, quality, callback);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 压缩已有 data URL（用于导入时重新压缩旧大图）
function compressDataUrl(dataUrl, maxWidth, quality, callback) {
  var img = new Image();
  img.onload = function() {
    compressImgToDataUrl(img, maxWidth, quality, callback);
  };
  img.onerror = function() {
    // 压缩失败时保留原图（可能是坏数据或CORS问题）
    callback(dataUrl);
  };
  img.src = dataUrl;
}

function compressImgToDataUrl(img, maxWidth, quality, callback) {
  var canvas = document.createElement('canvas');
  var w = img.width, h = img.height;
  if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  callback(canvas.toDataURL('image/jpeg', quality));
}

// 估算 data URL 的解码后字节数
function dataUrlSize(dataUrl) {
  try { return Math.round(atob(dataUrl.split(',')[1]).length); } catch (e) { return 0; }
}
