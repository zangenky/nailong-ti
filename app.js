// ======= 全局状态 =======
var currentQuestion = 0;
var answers = {};
var currentAdminTab = 'types';

// ======= 题目管理：优先返回自定义题目，否则返回默认 =======
function getQuestions() {
  try {
    var saved = localStorage.getItem('nt-questions');
    if (saved) {
      var parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return QUESTIONS;
}

// ======= 存储管理 (localStorage, 兼容微信X5) =======
var _cache = {};

function initStorage() {
  return new Promise(function(resolve) {
    _cache = {};
    var resolved = false;
    var done = function() { if (!resolved) { resolved = true; resolve(); } };
    var safeTimeout = setTimeout(done, 3000); // 3 秒超时保护，防止 IndexedDB 卡死

    // 先加载 localStorage 数据
    try {
      var oldData = localStorage.getItem('nt-cache');
      if (oldData) { _cache = JSON.parse(oldData); }
    } catch (e) {}
    // 尝试从 IndexedDB 迁移数据（旧版本用户）
    try {
      if (!window.indexedDB) { clearTimeout(safeTimeout); done(); return; }
      var req = indexedDB.open('NailongTI', 1);
      req.onsuccess = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('types')) { db.close(); clearTimeout(safeTimeout); done(); return; }
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
              clearTimeout(safeTimeout);
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
        setTimeout(function() { clearTimeout(safeTimeout); done(); }, 800); // 超时保护
      };
      req.onerror = function() { clearTimeout(safeTimeout); done(); };
    } catch (e) { clearTimeout(safeTimeout); done(); }
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
  try {
    var s = scores;
    var parts = ['EI', 'NS', 'TF', 'JP'].map(function(d) {
      return s[DIM_MAP[d].leftCode] + ',' + s[DIM_MAP[d].rightCode];
    });
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#r=' + parts.join('|'));
    } else {
      window.location.hash = 'r=' + parts.join('|');
    }
  } catch (e) {}
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
    // renderAdminList 是 async 函数，用 Promise 链处理错误
    try { Promise.resolve(renderAdminList()).catch(function() {}); } catch (e) {}

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
      if (page === 'admin') { try { Promise.resolve(renderAdminList()).catch(function() {}); } catch (e) {} }
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
  var qList = getQuestions();
  var q = qList[currentQuestion];
  var total = qList.length;

  $('progress-fill').style.width = ((currentQuestion + 1) / total * 100) + '%';
  $('progress-text').textContent = (currentQuestion + 1) + ' / ' + total;
  $('question-text').textContent = q.q;

  var container = $('options-container');
  container.innerHTML = '';

  var leftBtn = document.createElement('button');
  leftBtn.className = 'option-btn';
  leftBtn.innerHTML = '<span class="option-key">A</span> ' + q.left;
  leftBtn.addEventListener('click', function() { answerQuestion('left'); });
  container.appendChild(leftBtn);

  var rightBtn = document.createElement('button');
  rightBtn.className = 'option-btn';
  rightBtn.innerHTML = '<span class="option-key">B</span> ' + q.right;
  rightBtn.addEventListener('click', function() { answerQuestion('right'); });
  container.appendChild(rightBtn);

  if (q.neutral) {
    var neutralBtn = document.createElement('button');
    neutralBtn.className = 'option-btn option-neutral';
    neutralBtn.innerHTML = '<span class="option-key">C</span> ' + q.neutral;
    neutralBtn.addEventListener('click', function() { answerQuestion('neutral'); });
    container.appendChild(neutralBtn);
  }
}

function answerQuestion(side) {
  answers[currentQuestion] = side;
  currentQuestion++;
  if (currentQuestion >= getQuestions().length) {
    showResult();
  } else {
    renderQuestion();
  }
}

// ======= 结果计算 =======
function showResult() {
  try {
    var qList = getQuestions();
    var scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };
    for (var i = 0; i < qList.length; i++) {
      var q = qList[i];
      var side = answers[i];
      var dim = DIM_MAP[q.dim];
      if (side === 'left') {
        scores[dim.leftCode]++;
      } else if (side === 'right') {
        scores[dim.rightCode]++;
      }
      // neutral: 不计分
    }
    var typeStr = '';
    var dimKeys = ['EI', 'NS', 'TF', 'JP'];
    for (var i = 0; i < 4; i++) {
      var d = DIM_MAP[dimKeys[i]];
      typeStr += scores[d.leftCode] >= scores[d.rightCode] ? d.leftCode : d.rightCode;
    }
    renderResult(typeStr, scores);
    // 延迟保存 hash，避免在微信 X5 浏览器中干扰渲染
    setTimeout(function() { saveToHash(scores); }, 100);
  } catch (e) {
    alert('计算出错：' + e.message + '\n请截图发给管理员');
  }
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

  // ====== Tab 按钮 ======
  var tabDiv = document.createElement('div');
  tabDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
  tabDiv.innerHTML = '<button id="admin-tab-types" class="admin-tab" data-tab="types" style="flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:' + (currentAdminTab === 'types' ? 'bold' : 'normal') + ';background:' + (currentAdminTab === 'types' ? '#667eea' : 'rgba(255,255,255,0.2)') + ';color:' + (currentAdminTab === 'types' ? 'white' : 'rgba(255,255,255,0.8)') + ';">类型管理</button>'
    + '<button id="admin-tab-questions" class="admin-tab" data-tab="questions" style="flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:' + (currentAdminTab === 'questions' ? 'bold' : 'normal') + ';background:' + (currentAdminTab === 'questions' ? '#667eea' : 'rgba(255,255,255,0.2)') + ';color:' + (currentAdminTab === 'questions' ? 'white' : 'rgba(255,255,255,0.8)') + ';">题目管理</button>';
  container.appendChild(tabDiv);

  // Tab 切换事件
  var tabBtns = tabDiv.querySelectorAll('.admin-tab');
  for (var ti = 0; ti < tabBtns.length; ti++) {
    tabBtns[ti].addEventListener('click', function() {
      currentAdminTab = this.getAttribute('data-tab');
      renderAdminList();
    });
  }

  if (currentAdminTab === 'questions') {
    renderQuestionEditor(container);
    return;
  }

  // ====== 类型管理 ======
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

// ======= 题目编辑器 =======
function renderQuestionEditor(container) {
  var qList = getQuestions();

  // 构建维度下拉选项
  var dimOptions = '';
  for (var di = 0; di < DIMENSIONS.length; di++) {
    var d = DIMENSIONS[di];
    dimOptions += '<option value="' + d.key + '">' + d.left + '(' + d.leftCode + ') vs ' + d.right + '(' + d.rightCode + ')</option>';
  }

  for (var qi = 0; qi < qList.length; qi++) {
    (function(idx) {
      var q = qList[idx];
      var card = document.createElement('div');
      card.className = 'admin-card';
      card.style.cssText = 'background:white;border-radius:12px;padding:16px;flex-direction:column;gap:6px;';

      card.innerHTML = '<div style="font-weight:bold;color:#667eea;margin-bottom:2px;">第 ' + (idx + 1) + ' 题</div>'
        + '<div style="display:flex;gap:8px;align-items:center;"><label style="font-size:13px;color:#888;width:36px;flex-shrink:0;">维度</label>'
        + '<select class="q-dim" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' + dimOptions + '</select></div>'
        + '<div style="display:flex;gap:8px;align-items:flex-start;"><label style="font-size:13px;color:#888;width:36px;flex-shrink:0;padding-top:6px;">问题</label>'
        + '<textarea class="q-text" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;height:36px;font-family:inherit;">' + htmlEncode(q.q) + '</textarea></div>'
        + '<div style="display:flex;gap:8px;align-items:center;"><label style="font-size:13px;color:#888;width:36px;flex-shrink:0;">A</label>'
        + '<input class="q-left" value="' + htmlEncode(q.left) + '" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>'
        + '<div style="display:flex;gap:8px;align-items:center;"><label style="font-size:13px;color:#888;width:36px;flex-shrink:0;">B</label>'
        + '<input class="q-right" value="' + htmlEncode(q.right) + '" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;"></div>'
        + '<div style="display:flex;gap:8px;align-items:center;"><label style="font-size:13px;color:#888;width:36px;flex-shrink:0;">C</label>'
        + '<input class="q-neutral" value="' + htmlEncode(q.neutral || '') + '" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:13px;" placeholder="中立选项（选C不计分）"></div>';

      // 设置下拉框当前值
      card.querySelector('.q-dim').value = q.dim;

      container.appendChild(card);
    })(qi);
  }

  // 按钮行
  var btnDiv = document.createElement('div');
  btnDiv.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:16px;';

  var row1 = document.createElement('div');
  row1.style.cssText = 'display:flex;gap:8px;';
  row1.innerHTML = '<button id="save-questions-btn" style="flex:1;padding:12px;background:#4CAF50;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">💾 保存到本地</button>'
    + '<button id="publish-questions-btn" style="flex:1;padding:12px;background:#FF9800;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🌐 发布到线上</button>';
  btnDiv.appendChild(row1);

  var row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:8px;';
  row2.innerHTML = '<button id="reset-questions-btn" style="flex:1;padding:10px;background:#f44336;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer;">↺ 恢复默认</button>';
  btnDiv.appendChild(row2);

  container.appendChild(btnDiv);

  function collectQuestions() {
    var cards = container.querySelectorAll('.admin-card');
    var result = [];
    for (var j = 0; j < cards.length; j++) {
      result.push({
        dim: cards[j].querySelector('.q-dim').value,
        q: cards[j].querySelector('.q-text').value,
        left: cards[j].querySelector('.q-left').value,
        right: cards[j].querySelector('.q-right').value,
        neutral: cards[j].querySelector('.q-neutral').value || ''
      });
    }
    return result;
  }

  $('save-questions-btn').addEventListener('click', function() {
    saveCustomQuestions(collectQuestions(), false);
  });

  $('publish-questions-btn').addEventListener('click', function() {
    saveCustomQuestions(collectQuestions(), true);
  });

  $('reset-questions-btn').addEventListener('click', function() {
    if (confirm('确定恢复默认题目吗？')) {
      try { localStorage.removeItem('nt-questions'); } catch (e) {}
      renderAdminList();
    }
  });
}

function saveCustomQuestions(qList, showPublish) {
  // 验证每个维度至少 1 题
  var dims = {};
  for (var i = 0; i < qList.length; i++) {
    dims[qList[i].dim] = (dims[qList[i].dim] || 0) + 1;
  }
  for (var d in dims) {
    if (dims[d] < 1) { alert('每个维度至少需要 1 道题！'); return; }
  }

  try {
    localStorage.setItem('nt-questions', JSON.stringify(qList));
    alert('✅ 已保存到本地！（仅你可见）');
    if (showPublish) {
      showPublishDialog(qList);
    } else {
      renderAdminList();
    }
  } catch (e) {
    alert('保存失败：' + e.message);
  }
}

function showPublishDialog(qList) {
  // 生成 QUESTIONS 代码
  var code = 'const QUESTIONS = [\n';
  for (var i = 0; i < qList.length; i++) {
    var q = qList[i];
    code += '  {\n    dim: \'' + q.dim + '\',\n    q: \'' + escapeJsStr(q.q) + '\',\n    left: \'' + escapeJsStr(q.left) + '\',\n    right: \'' + escapeJsStr(q.right) + '\'';
    if (q.neutral) {
      code += ',\n    neutral: \'' + escapeJsStr(q.neutral) + '\'';
    }
    code += '\n  }';
    if (i < qList.length - 1) code += ',';
    code += '\n';
  }
  code += '];';

  // 弹窗遮罩
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });

  var box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
  box.innerHTML = '<h3 style="margin:0 0 8px;color:#333;">🌐 发布到线上</h3>'
    + '<p style="font-size:14px;color:#666;margin-bottom:16px;">把下面的代码复制后发给我，我来更新 data.js 并部署到线上，所有人就能看到了。</p>'
    + '<textarea id="publish-code" style="width:100%;height:300px;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:13px;font-family:Courier New,monospace;resize:vertical;white-space:pre;overflow:auto;" readonly></textarea>'
    + '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button id="copy-code-btn" style="flex:1;padding:12px;background:#667eea;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">📋 复制代码</button>'
    + '<button id="close-dialog-btn" style="flex:1;padding:12px;background:#eee;color:#666;border:none;border-radius:8px;font-size:14px;cursor:pointer;">关闭</button></div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  $('publish-code').value = code;
  $('publish-code').style.height = Math.min(300, code.split('\n').length * 20) + 'px';

  $('copy-code-btn').addEventListener('click', function() {
    var ta = $('publish-code');
    ta.select();
    try {
      document.execCommand('copy');
      $('copy-code-btn').textContent = '✅ 已复制！';
      setTimeout(function() { $('copy-code-btn').textContent = '📋 复制代码'; }, 2000);
    } catch (e) { alert('复制失败，请手动选中并复制'); }
  });

  $('close-dialog-btn').addEventListener('click', function() {
    document.body.removeChild(overlay);
    renderAdminList();
  });
}

function escapeJsStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function htmlEncode(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
