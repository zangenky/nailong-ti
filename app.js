// ======= 全局状态 =======
let currentQuestion = 0;
const answers = {};       // { "0": "left", "3": "right", ... }
const CUSTOM_DATA_KEY = 'nailong-ti-custom';

// ======= 存储管理 =======
const CustomStorage = {
  get() {
    const data = localStorage.getItem(CUSTOM_DATA_KEY);
    return data ? JSON.parse(data) : {};
  },
  save(data) {
    localStorage.setItem(CUSTOM_DATA_KEY, JSON.stringify(data));
  },
  getImage(typeCode) {
    const all = this.get();
    return all[typeCode]?.image || null;
  },
  getName(typeCode) {
    const all = this.get();
    return all[typeCode]?.name || null;
  },
  getDesc(typeCode) {
    const all = this.get();
    return all[typeCode]?.desc || null;
  },
  setTypeData(typeCode, data) {
    const all = this.get();
    all[typeCode] = { ...(all[typeCode] || {}), ...data };
    this.save(all);
  }
};

// ======= DOM =======
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
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
  // 检测是否已上传图片
  const custom = CustomStorage.get();
  const imgData = custom[typeStr]?.image || null;

  const typeInfo = TYPE_DATA[typeStr] || { name: '未知', desc: '暂无描述', color: '#999' };
  const customName = CustomStorage.getName(typeStr) || typeInfo.name;
  const customDesc = CustomStorage.getDesc(typeStr) || typeInfo.desc;

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

  const allCodes = Object.keys(TYPE_DATA);
  allCodes.forEach(code => {
    const info = TYPE_DATA[code];
    const custom = CustomStorage.get();
    const saved = custom[code] || {};
    const imgSrc = saved.image || null;

    const card = document.createElement('div');
    card.className = 'admin-card';

    card.innerHTML = `
      <div class="type-code">${code}</div>
      <div class="preview-img" data-code="${code}">
        ${imgSrc ? `<img src="${imgSrc}">` : '📷'}
      </div>
      <div class="admin-fields">
        <input class="admin-name" data-code="${code}" value="${saved.name || info.name}" placeholder="奶龙名字">
        <textarea class="admin-desc" data-code="${code}" placeholder="描述文字...">${saved.desc || info.desc}</textarea>
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
        compressImage(file, 200, 80, (dataUrl) => {
          try {
            CustomStorage.setTypeData(code, { image: dataUrl });
            renderAdminList();
          } catch (err) {
            alert('存储空间不足，请使用更小的图片。');
            console.error(err);
          }
        });
      });
      input.click();
    });

    // 名字变更
    const nameInput = card.querySelector('.admin-name');
    nameInput.addEventListener('change', () => {
      CustomStorage.setTypeData(code, { name: nameInput.value });
    });

    // 描述变更
    const descInput = card.querySelector('.admin-desc');
    descInput.addEventListener('change', () => {
      CustomStorage.setTypeData(code, { desc: descInput.value });
    });

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
