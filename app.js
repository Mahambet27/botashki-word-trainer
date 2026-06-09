const $ = (id) => document.getElementById(id);

const config = window.BOTASHKI_SUPABASE || window.SUPABASE_CONFIG || {};

const hasSupabaseConfig =
  config.url &&
  config.anonKey &&
  !config.url.includes("PASTE_") &&
  !config.anonKey.includes("PASTE_");

const supabaseClient =
  hasSupabaseConfig && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

const WORD_LIST =
  Array.isArray(window.WORDS)
    ? window.WORDS
    : typeof WORDS !== "undefined"
      ? WORDS
      : [];

const CHINESE_LIST =
  Array.isArray(window.CHINESE_WORDS)
    ? window.CHINESE_WORDS
    : typeof CHINESE_WORDS !== "undefined"
      ? CHINESE_WORDS
      : [];

let appUser = JSON.parse(localStorage.getItem("botashkiUser") || "null");

let mode = "order";
let currentUnit = "ALL";
let filteredWords = [...WORD_LIST];
let index = 0;
let learned = new Set(JSON.parse(localStorage.getItem("learnedWords") || "[]"));

let chineseMode = "order";
let currentChineseUnit = "ALL";
let filteredChineseWords = [...CHINESE_LIST];
let chineseIndex = 0;
let learnedChinese = new Set(JSON.parse(localStorage.getItem("learnedChineseWords") || "[]"));

let englishTestWords = [];
let englishTestIndex = 0;
let englishTestScore = 0;
let currentEnglishTestAnswer = "";

let chineseTestWords = [];
let chineseTestIndex = 0;
let chineseTestScore = 0;
let currentChineseTestAnswer = "";

const ADMIN_PHONES = [
  "87055772819",
  "+87055772819",
  "77055772819",
  "+77055772819"
];

function normalizePhone(phone) {
  return String(phone || "").replace(/\s+/g, "").trim();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === id);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setMessage(id, text, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = text || "";
  element.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function isAdminUser() {
  if (!appUser) return false;

  const phone = normalizePhone(appUser.phone);

  return appUser.is_admin === true || ADMIN_PHONES.includes(phone);
}

function updateAdminButton() {
  const adminBtn = $("adminOpenBtn");
  if (!adminBtn) return;

  adminBtn.classList.toggle("hidden", !isAdminUser());
}

function saveUser(user) {
  appUser = {
    ...user,
    phone: normalizePhone(user.phone),
    is_admin: user.is_admin === true || ADMIN_PHONES.includes(normalizePhone(user.phone))
  };

  localStorage.setItem("botashkiUser", JSON.stringify(appUser));
  renderUserLine();
}

function clearUser() {
  appUser = null;
  localStorage.removeItem("botashkiUser");
  renderUserLine();
}

function renderUserLine() {
  if ($("userLine")) {
    $("userLine").textContent = appUser
      ? `${appUser.name} · ${appUser.phone}${isAdminUser() ? " · ADMIN" : ""}`
      : "BOTASHKI 2026";
  }

  if ($("welcomeName")) {
    $("welcomeName").textContent = appUser
      ? `${appUser.name}, добро пожаловать!`
      : "на сайт Боташки";
  }

  updateAdminButton();
}

function getSavedSettings() {
  return {
    theme: localStorage.getItem("siteTheme") || "light",
    color: localStorage.getItem("siteColor") || "blue",
  };
}

function applyTheme(theme, color) {
  document.body.classList.toggle("theme-dark", theme === "dark");

  document.body.classList.remove("color-blue", "color-pink", "color-purple", "color-green");
  document.body.classList.add(`color-${color}`);

  localStorage.setItem("siteTheme", theme);
  localStorage.setItem("siteColor", color);

  if ($("themeSelect")) $("themeSelect").value = theme;
  if ($("colorSelect")) $("colorSelect").value = color;
}

function setupAuth() {
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const resetForm = $("resetForm");

  if (!loginForm || !registerForm || !resetForm) {
    console.error("Auth forms not found in index.html");
    return;
  }

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.authTab;

      document.querySelectorAll("[data-auth-tab]").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      loginForm.classList.toggle("active", tab === "login");
      registerForm.classList.toggle("active", tab === "register");
      resetForm.classList.toggle("active", tab === "reset");

      setMessage("authMessage", "");
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setMessage("authMessage", "Supabase не подключен. Проверь supabase-config.js", true);
      return;
    }

    const phone = $("loginPhone").value.trim();
    const password = $("loginPassword").value;

    const { data, error } = await supabaseClient.rpc("login_app_user", {
      p_phone: phone,
      p_password: password,
    });

    if (error) {
      setMessage("authMessage", "Ошибка входа: " + error.message, true);
      return;
    }

    if (!data || !data.success) {
      setMessage("authMessage", data?.message || "Номер или пароль неверный", true);
      return;
    }

    saveUser(data.user);
    setMessage("authMessage", "Успешно! Вы вошли.");

    setTimeout(() => {
      showScreen("welcomeScreen");
    }, 800);
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setMessage("authMessage", "Supabase не подключен. Проверь supabase-config.js", true);
      return;
    }

    const name = $("registerName").value.trim();
    const phone = $("registerPhone").value.trim();
    const password = $("registerPassword").value;
    const recoveryWord = $("registerRecoveryWord").value.trim();

    const { data, error } = await supabaseClient.rpc("register_app_user", {
      p_name: name,
      p_phone: phone,
      p_password: password,
      p_recovery_word: recoveryWord,
    });

    if (error) {
      setMessage("authMessage", "Ошибка регистрации: " + error.message, true);
      return;
    }

    if (!data || !data.success) {
      setMessage("authMessage", data?.message || "Ошибка регистрации", true);
      return;
    }

    saveUser(data.user);
    setMessage("authMessage", "Успешно! Аккаунт создан.");

    setTimeout(() => {
      showScreen("welcomeScreen");
    }, 800);
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setMessage("authMessage", "Supabase не подключен. Проверь supabase-config.js", true);
      return;
    }

    const phone = $("resetPhone").value.trim();
    const recoveryWord = $("resetRecoveryWord").value.trim();
    const newPassword = $("resetNewPassword").value;

    const { data, error } = await supabaseClient.rpc("reset_app_password", {
      p_phone: phone,
      p_recovery_word: recoveryWord,
      p_new_password: newPassword,
    });

    if (error) {
      setMessage("authMessage", "Ошибка сброса: " + error.message, true);
      return;
    }

    if (!data || !data.success) {
      setMessage("authMessage", data?.message || "Ошибка сброса", true);
      return;
    }

    resetForm.reset();
    setMessage("authMessage", "Успешно! Пароль обновлен. Теперь войдите.");

    setTimeout(() => {
      const loginTab = document.querySelector('[data-auth-tab="login"]');
      if (loginTab) loginTab.click();
    }, 800);
  });
}

function setupNavigation() {
  if ($("startBtn")) {
    $("startBtn").addEventListener("click", () => showScreen("homeScreen"));
  }

  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", () => {
      clearUser();
      showScreen("authScreen");
    });
  }

  document.querySelectorAll("[data-course]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.course === "english") showScreen("englishScreen");
      if (button.dataset.course === "chinese") showScreen("chineseScreen");
    });
  });

  document.querySelectorAll("[data-back-home]").forEach((button) => {
    button.addEventListener("click", () => showScreen("homeScreen"));
  });

  document.querySelectorAll("[data-back-screen]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.backScreen));
  });

  if ($("settingsOpenBtn")) {
    $("settingsOpenBtn").addEventListener("click", () => showScreen("settingsScreen"));
  }

  if ($("adminOpenBtn")) {
    $("adminOpenBtn").addEventListener("click", () => {
      if (!isAdminUser()) {
        alert("Нет доступа. Вы не админ.");
        return;
      }

      showScreen("adminScreen");
    });
  }

  if ($("adminLoadUsersBtn")) {
    $("adminLoadUsersBtn").addEventListener("click", loadAdminUsers);
  }

  if ($("adminRefreshBtn")) {
    $("adminRefreshBtn").addEventListener("click", loadAdminUsers);
  }
}

async function loadAdminUsers() {
  const list = $("adminUsersList");
  const passwordInput = $("adminPassword");

  if (!list || !passwordInput) return;

  if (!isAdminUser()) {
    setMessage("adminMessage", "Нет доступа. Вы не админ.", true);
    return;
  }

  const adminPassword = passwordInput.value;

  if (!adminPassword) {
    setMessage("adminMessage", "Введите пароль админа.", true);
    return;
  }

  if (!supabaseClient) {
    setMessage("adminMessage", "Supabase не подключен.", true);
    return;
  }

  setMessage("adminMessage", "Загрузка...");

  const { data, error } = await supabaseClient.rpc("admin_list_users", {
    p_admin_phone: appUser.phone,
    p_admin_password: adminPassword,
  });

  if (error) {
    setMessage("adminMessage", "Ошибка: " + error.message, true);
    return;
  }

  if (!data || !data.success) {
    setMessage("adminMessage", data?.message || "Ошибка доступа", true);
    return;
  }

  const users = data.users || [];

  if (!users.length) {
    list.innerHTML = `<p class="subtitle">Пользователей пока нет.</p>`;
    setMessage("adminMessage", "Пользователей нет.");
    return;
  }

  list.innerHTML = users
    .map((user) => {
      const created = user.created_at
        ? new Date(user.created_at).toLocaleString()
        : "—";

      return `
        <div class="admin-user-card">
          <div class="admin-user-top">
            <div>
              <strong>${escapeHtml(user.name)}</strong>
              <p>${escapeHtml(user.phone)}</p>
            </div>

            <span class="admin-badge ${user.is_admin ? "admin" : ""}">
              ${user.is_admin ? "ADMIN" : "USER"}
            </span>
          </div>

          <small>Дата регистрации: ${created}</small>

          <div class="admin-actions">
            <button class="small-btn" type="button" data-reset-user="${user.id}">
              🔑 Новый пароль
            </button>

            <button class="small-btn danger-btn" type="button" data-delete-user="${user.id}">
              🗑 Удалить
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => {
      adminDeleteUser(button.dataset.deleteUser);
    });
  });

  document.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", () => {
      adminSetPassword(button.dataset.resetUser);
    });
  });

  setMessage("adminMessage", "Пользователи загружены.");
}

async function adminDeleteUser(userId) {
  const adminPassword = $("adminPassword")?.value;

  if (!adminPassword) {
    setMessage("adminMessage", "Введите пароль админа.", true);
    return;
  }

  const ok = confirm("Удалить этого пользователя?");
  if (!ok) return;

  const { data, error } = await supabaseClient.rpc("admin_delete_user", {
    p_admin_phone: appUser.phone,
    p_admin_password: adminPassword,
    p_user_id: userId,
  });

  if (error) {
    setMessage("adminMessage", "Ошибка удаления: " + error.message, true);
    return;
  }

  if (!data || !data.success) {
    setMessage("adminMessage", data?.message || "Не удалось удалить", true);
    return;
  }

  setMessage("adminMessage", "Пользователь удалён.");
  await loadAdminUsers();
}

async function adminSetPassword(userId) {
  const adminPassword = $("adminPassword")?.value;

  if (!adminPassword) {
    setMessage("adminMessage", "Введите пароль админа.", true);
    return;
  }

  const newPassword = prompt("Введите новый пароль для пользователя:");

  if (!newPassword) return;

  const { data, error } = await supabaseClient.rpc("admin_set_user_password", {
    p_admin_phone: appUser.phone,
    p_admin_password: adminPassword,
    p_user_id: userId,
    p_new_password: newPassword,
  });

  if (error) {
    setMessage("adminMessage", "Ошибка: " + error.message, true);
    return;
  }

  if (!data || !data.success) {
    setMessage("adminMessage", data?.message || "Не удалось обновить пароль", true);
    return;
  }

  setMessage("adminMessage", "Пароль пользователя обновлён.");
}

function makeLearnedKey(item) {
  return `${item.unit || "NO_UNIT"}__${item.word || ""}`;
}

function saveEnglishProgress() {
  localStorage.setItem("learnedWords", JSON.stringify([...learned]));
}

function getUnits() {
  const units = WORD_LIST.map((item) => item.unit).filter(Boolean);
  return ["ALL", ...new Set(units)];
}

function fillUnitSelect() {
  const select = $("unitSelect");
  if (!select) return;

  select.innerHTML = "";

  getUnits().forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit === "ALL" ? "All Units" : unit;
    select.appendChild(option);
  });
}

function updateFilteredWords() {
  const search = $("searchInput")?.value.trim().toLowerCase() || "";

  let list = currentUnit === "ALL"
    ? [...WORD_LIST]
    : WORD_LIST.filter((item) => item.unit === currentUnit);

  if (search) {
    list = list.filter((item) =>
      [item.unit, item.word, item.meaning, item.example, item.russian]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }

  filteredWords = list;
  if (index >= filteredWords.length) index = 0;
}

function fillWordSelect() {
  const select = $("wordSelect");
  if (!select) return;

  select.innerHTML = "";

  if (!filteredWords.length) {
    select.innerHTML = `<option value="">No words found</option>`;
    return;
  }

  filteredWords.forEach((item, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i + 1}. ${item.unit || ""} — ${item.word || ""}`;
    select.appendChild(option);
  });

  select.value = index;
}

function renderCard() {
  if (!filteredWords.length) {
    if ($("word")) $("word").textContent = "No word";
    if ($("backWord")) $("backWord").textContent = "No word";
    if ($("meaning")) $("meaning").textContent = "Not found";
    if ($("example")) $("example").textContent = "";
    if ($("russian")) $("russian").textContent = "";
    if ($("currentNumber")) $("currentNumber").textContent = "0";
    if ($("totalNumber")) $("totalNumber").textContent = "0";
    if ($("learnedNumber")) $("learnedNumber").textContent = "0";
    if ($("progressLine")) $("progressLine").style.width = "0%";
    return;
  }

  const item = filteredWords[index];
  const key = makeLearnedKey(item);
  const isLearned = learned.has(key);

  $("word").textContent = item.word || "";
  $("backWord").textContent = item.word || "";
  $("meaning").textContent = item.meaning || "";
  $("example").textContent = item.example || "";
  $("russian").textContent = item.russian || "";

  $("unitLabel").textContent = item.unit || "NO UNIT";
  $("backUnitLabel").textContent = item.unit || "NO UNIT";

  $("currentNumber").textContent = index + 1;
  $("totalNumber").textContent = filteredWords.length;

  const learnedCount = filteredWords.filter((word) => learned.has(makeLearnedKey(word))).length;
  $("learnedNumber").textContent = learnedCount;

  $("progressLine").style.width = `${filteredWords.length ? (learnedCount / filteredWords.length) * 100 : 0}%`;
  $("learnedBtn").textContent = isLearned ? "Уже выучила ✓" : "Выучила";

  if ($("wordSelect")) $("wordSelect").value = index;
  if ($("card")) $("card").classList.remove("open");

  renderEnglishAllWordsList();
}

function nextIndex() {
  if (filteredWords.length <= 1) return 0;

  if (mode === "random") {
    let randomIndex;

    do {
      randomIndex = Math.floor(Math.random() * filteredWords.length);
    } while (randomIndex === index);

    return randomIndex;
  }

  return (index + 1) % filteredWords.length;
}

function previousIndex() {
  if (filteredWords.length <= 1) return 0;
  return index === 0 ? filteredWords.length - 1 : index - 1;
}

function renderEnglishAllWordsList() {
  const box = $("englishAllWordsList");
  if (!box) return;

  if (!filteredWords.length) {
    box.innerHTML = `<p class="subtitle">Слова не найдены.</p>`;
    return;
  }

  box.innerHTML = filteredWords.map((item, i) => {
    const isLearned = learned.has(makeLearnedKey(item));

    return `
      <button class="word-list-item english-list-item ${isLearned ? "learned" : ""}" type="button" data-en-list-index="${i}">
        <span class="word-list-number">${i + 1}</span>
        <span class="word-list-hanzi">${escapeHtml(item.word)}</span>
        <span class="word-list-info">
          <strong>${escapeHtml(item.meaning)}</strong>
          <small>${escapeHtml(item.russian)} · ${escapeHtml(item.unit)}</small>
        </span>
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-en-list-index]").forEach((button) => {
    button.addEventListener("click", () => {
      index = Number(button.dataset.enListIndex);
      renderCard();
      $("englishListBox").classList.add("hidden");
    });
  });
}

function startEnglishTest() {
  englishTestWords = shuffleArray(filteredWords).slice(0, 10);
  englishTestIndex = 0;
  englishTestScore = 0;

  if (!englishTestWords.length) {
    setMessage("englishTestMessage", "Нет слов для теста.", true);
    return;
  }

  $("englishListBox").classList.add("hidden");
  $("englishTestBox").classList.remove("hidden");
  renderEnglishTestQuestion();
}

function renderEnglishTestQuestion() {
  const item = englishTestWords[englishTestIndex];
  currentEnglishTestAnswer = item.meaning || "";

  $("englishTestCounter").textContent = `Question ${englishTestIndex + 1}/${englishTestWords.length}`;
  $("englishTestWord").textContent = item.word || "";
  $("englishTestMessage").textContent = "";
  $("englishNextTestBtn").classList.add("hidden");

  const wrong = shuffleArray(
    WORD_LIST.filter((word) => word.meaning && word.meaning !== item.meaning).map((word) => word.meaning)
  ).slice(0, 3);

  const options = shuffleArray([item.meaning, ...wrong]);

  $("englishTestOptions").innerHTML = options.map((option) => {
    return `<button class="test-option" type="button" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
  }).join("");

  document.querySelectorAll("#englishTestOptions .test-option").forEach((button) => {
    button.addEventListener("click", () => checkEnglishTestAnswer(button.dataset.answer));
  });
}

function checkEnglishTestAnswer(answer) {
  const correct = answer === currentEnglishTestAnswer;

  if (correct) {
    englishTestScore++;
    setMessage("englishTestMessage", "Правильно ✅");
  } else {
    setMessage("englishTestMessage", `Неправильно ❌ Correct: ${currentEnglishTestAnswer}`, true);
  }

  document.querySelectorAll("#englishTestOptions .test-option").forEach((button) => {
    button.disabled = true;

    if (button.dataset.answer === currentEnglishTestAnswer) {
      button.classList.add("correct");
    } else if (button.dataset.answer === answer) {
      button.classList.add("wrong");
    }
  });

  $("englishNextTestBtn").classList.remove("hidden");
}

function nextEnglishTestQuestion() {
  englishTestIndex++;

  if (englishTestIndex >= englishTestWords.length) {
    $("englishTestCounter").textContent = "Test finished";
    $("englishTestWord").textContent = `${englishTestScore}/${englishTestWords.length}`;
    $("englishTestOptions").innerHTML = "";
    $("englishNextTestBtn").classList.add("hidden");
    setMessage("englishTestMessage", "Тест завершён.");
    return;
  }

  renderEnglishTestQuestion();
}

function setupEnglishTrainer() {
  if ($("card")) {
    $("card").addEventListener("click", () => $("card").classList.toggle("open"));
  }

  if ($("nextBtn")) {
    $("nextBtn").addEventListener("click", () => {
      index = nextIndex();
      renderCard();
    });
  }

  if ($("prevBtn")) {
    $("prevBtn").addEventListener("click", () => {
      index = previousIndex();
      renderCard();
    });
  }

  if ($("learnedBtn")) {
    $("learnedBtn").addEventListener("click", () => {
      if (!filteredWords.length) return;

      const key = makeLearnedKey(filteredWords[index]);

      if (learned.has(key)) {
        learned.delete(key);
      } else {
        learned.add(key);
      }

      saveEnglishProgress();
      renderCard();
    });
  }

  if ($("resetBtn")) {
    $("resetBtn").addEventListener("click", () => {
      if (!confirm("Сбросить прогресс English?")) return;

      learned.clear();
      saveEnglishProgress();
      renderCard();
    });
  }

  document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      mode = button.dataset.mode;
    });
  });

  if ($("unitSelect")) {
    $("unitSelect").addEventListener("change", () => {
      currentUnit = $("unitSelect").value;
      index = 0;
      updateFilteredWords();
      fillWordSelect();
      renderCard();
    });
  }

  if ($("wordSelect")) {
    $("wordSelect").addEventListener("change", () => {
      index = Number($("wordSelect").value) || 0;
      renderCard();
    });
  }

  if ($("searchInput")) {
    $("searchInput").addEventListener("input", () => {
      index = 0;
      updateFilteredWords();
      fillWordSelect();
      renderCard();
    });
  }

  if ($("englishAllWordsBtn")) {
    $("englishAllWordsBtn").addEventListener("click", () => {
      $("englishTestBox").classList.add("hidden");
      $("englishListBox").classList.toggle("hidden");
      renderEnglishAllWordsList();
    });
  }

  if ($("englishCloseListBtn")) {
    $("englishCloseListBtn").addEventListener("click", () => $("englishListBox").classList.add("hidden"));
  }

  if ($("englishTestBtn")) {
    $("englishTestBtn").addEventListener("click", startEnglishTest);
  }

  if ($("englishCloseTestBtn")) {
    $("englishCloseTestBtn").addEventListener("click", () => $("englishTestBox").classList.add("hidden"));
  }

  if ($("englishNextTestBtn")) {
    $("englishNextTestBtn").addEventListener("click", nextEnglishTestQuestion);
  }
}

function makeChineseLearnedKey(item) {
  return `${item.unit || "UNIT-1"}__${item.hanzi || ""}__${item.pinyin || ""}`;
}

function saveChineseProgress() {
  localStorage.setItem("learnedChineseWords", JSON.stringify([...learnedChinese]));
}

function getChineseUnits() {
  const units = CHINESE_LIST.map((item) => item.unit || "UNIT-1").filter(Boolean);
  return ["ALL", ...new Set(units)];
}

function fillChineseUnitSelect() {
  const select = $("chUnitSelect");
  if (!select) return;

  select.innerHTML = "";

  getChineseUnits().forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit === "ALL" ? "All Units" : unit;
    select.appendChild(option);
  });
}

function updateFilteredChineseWords() {
  const search = $("chSearchInput")?.value.trim().toLowerCase() || "";

  let list =
    currentChineseUnit === "ALL"
      ? [...CHINESE_LIST]
      : CHINESE_LIST.filter((item) => (item.unit || "UNIT-1") === currentChineseUnit);

  if (search) {
    list = list.filter((item) =>
      [item.unit, item.hanzi, item.pinyin, item.meaning, item.example, item.russian]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }

  filteredChineseWords = list;
  if (chineseIndex >= filteredChineseWords.length) chineseIndex = 0;
}

function fillChineseWordSelect() {
  const select = $("chWordSelect");
  if (!select) return;

  select.innerHTML = "";

  if (!filteredChineseWords.length) {
    select.innerHTML = `<option value="">No words found</option>`;
    return;
  }

  filteredChineseWords.forEach((item, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i + 1}. ${item.hanzi || ""} — ${item.pinyin || ""}`;
    select.appendChild(option);
  });

  select.value = chineseIndex;
}

function renderChineseCard() {
  if (!filteredChineseWords.length) {
  if ($("chHanzi")) $("chHanzi").textContent = "No word";
  if ($("chBackHanzi")) $("chBackHanzi").textContent = "No word";
  if ($("chFrontMeaning")) $("chFrontMeaning").textContent = "";
  if ($("chPinyin")) $("chPinyin").textContent = "";
  if ($("chBackPinyin")) $("chBackPinyin").textContent = "";
  if ($("chBackPinyinText")) $("chBackPinyinText").textContent = "";
  if ($("chMeaning")) $("chMeaning").textContent = "Not found";
  if ($("chExample")) $("chExample").textContent = "";
  if ($("chRussian")) $("chRussian").textContent = "";
  if ($("chCurrentNumber")) $("chCurrentNumber").textContent = "0";
  if ($("chTotalNumber")) $("chTotalNumber").textContent = "0";
  if ($("chLearnedNumber")) $("chLearnedNumber").textContent = "0";
  if ($("chProgressLine")) $("chProgressLine").style.width = "0%";
  return;
}

  const item = filteredChineseWords[chineseIndex];
  const key = makeChineseLearnedKey(item);
  const isLearned = learnedChinese.has(key);

  $("chUnit").textContent = item.unit || "UNIT-1";
  $("chBackUnit").textContent = item.unit || "UNIT-1";

 $("chHanzi").textContent = item.hanzi || "";
$("chBackHanzi").textContent = item.hanzi || "";

if ($("chFrontMeaning")) {
  $("chFrontMeaning").textContent = item.russian || item.meaning || "";
}

$("chPinyin").textContent = item.pinyin || "";
$("chBackPinyin").textContent = item.pinyin || "";

$("chMeaning").textContent = item.meaning || "";

if ($("chBackPinyinText")) {
  $("chBackPinyinText").textContent = item.pinyin || "";
}

$("chExample").textContent = item.example || "";
$("chRussian").textContent = item.russianExplanation || item.russian || item.meaning || "";

  $("chCurrentNumber").textContent = chineseIndex + 1;
  $("chTotalNumber").textContent = filteredChineseWords.length;

  const learnedCount = filteredChineseWords.filter((word) => learnedChinese.has(makeChineseLearnedKey(word))).length;
  $("chLearnedNumber").textContent = learnedCount;

  $("chProgressLine").style.width = `${filteredChineseWords.length ? (learnedCount / filteredChineseWords.length) * 100 : 0}%`;
  $("chLearnedBtn").textContent = isLearned ? "Уже выучила ✓" : "Выучила";

  if ($("chWordSelect")) $("chWordSelect").value = chineseIndex;
  if ($("chineseCard")) $("chineseCard").classList.remove("open");

  renderChineseAllWordsList();
}

function nextChineseIndex() {
  if (filteredChineseWords.length <= 1) return 0;

  if (chineseMode === "random") {
    let randomIndex;

    do {
      randomIndex = Math.floor(Math.random() * filteredChineseWords.length);
    } while (randomIndex === chineseIndex);

    return randomIndex;
  }

  return (chineseIndex + 1) % filteredChineseWords.length;
}

function previousChineseIndex() {
  if (filteredChineseWords.length <= 1) return 0;
  return chineseIndex === 0 ? filteredChineseWords.length - 1 : chineseIndex - 1;
}

function renderChineseAllWordsList() {
  const box = $("chineseAllWordsList");
  if (!box) return;

  if (!filteredChineseWords.length) {
    box.innerHTML = `<p class="subtitle">Слова не найдены.</p>`;
    return;
  }

  box.innerHTML = filteredChineseWords.map((item, i) => {
    const isLearned = learnedChinese.has(makeChineseLearnedKey(item));

    return `
      <button class="word-list-item ${isLearned ? "learned" : ""}" type="button" data-ch-list-index="${i}">
        <span class="word-list-number">${i + 1}</span>
        <span class="word-list-hanzi">${escapeHtml(item.hanzi)}</span>
        <span class="word-list-info">
          <strong>${escapeHtml(item.pinyin)}</strong>
          <small>${escapeHtml(item.meaning)} · ${escapeHtml(item.russian)}</small>
        </span>
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-ch-list-index]").forEach((button) => {
    button.addEventListener("click", () => {
      chineseIndex = Number(button.dataset.chListIndex);
      renderChineseCard();
      $("chineseListBox").classList.add("hidden");
    });
  });
}

function startChineseTest() {
  chineseTestWords = shuffleArray(filteredChineseWords).slice(0, 10);
  chineseTestIndex = 0;
  chineseTestScore = 0;

  if (!chineseTestWords.length) {
    setMessage("chTestMessage", "Нет слов для теста.", true);
    return;
  }

  $("chineseListBox").classList.add("hidden");
  $("chineseTestBox").classList.remove("hidden");
  renderChineseTestQuestion();
}

function renderChineseTestQuestion() {
  const item = chineseTestWords[chineseTestIndex];
  currentChineseTestAnswer = item.meaning || "";

  $("chTestCounter").textContent = `Вопрос ${chineseTestIndex + 1}/${chineseTestWords.length}`;
  $("chTestHanzi").textContent = item.hanzi || "";
  $("chTestPinyin").textContent = item.pinyin || "";
  $("chTestMessage").textContent = "";
  $("chNextTestBtn").classList.add("hidden");

  const wrong = shuffleArray(
    CHINESE_LIST.filter((word) => word.meaning && word.meaning !== item.meaning).map((word) => word.meaning)
  ).slice(0, 3);

  const options = shuffleArray([item.meaning, ...wrong]);

  $("chTestOptions").innerHTML = options.map((option) => {
    return `<button class="test-option" type="button" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
  }).join("");

  document.querySelectorAll("#chTestOptions .test-option").forEach((button) => {
    button.addEventListener("click", () => checkChineseTestAnswer(button.dataset.answer));
  });
}

function checkChineseTestAnswer(answer) {
  const correct = answer === currentChineseTestAnswer;

  if (correct) {
    chineseTestScore++;
    setMessage("chTestMessage", "Правильно ✅");
  } else {
    setMessage("chTestMessage", `Неправильно ❌ Ответ: ${currentChineseTestAnswer}`, true);
  }

  document.querySelectorAll("#chTestOptions .test-option").forEach((button) => {
    button.disabled = true;

    if (button.dataset.answer === currentChineseTestAnswer) {
      button.classList.add("correct");
    } else if (button.dataset.answer === answer) {
      button.classList.add("wrong");
    }
  });

  $("chNextTestBtn").classList.remove("hidden");
}

function nextChineseTestQuestion() {
  chineseTestIndex++;

  if (chineseTestIndex >= chineseTestWords.length) {
    $("chTestCounter").textContent = "Тест завершен";
    $("chTestHanzi").textContent = `${chineseTestScore}/${chineseTestWords.length}`;
    $("chTestPinyin").textContent = "Ваш результат";
    $("chTestOptions").innerHTML = "";
    $("chNextTestBtn").classList.add("hidden");
    setMessage("chTestMessage", "Тест завершён.");
    return;
  }

  renderChineseTestQuestion();
}

function setupChineseTrainer() {
  if ($("chineseCard")) {
    $("chineseCard").addEventListener("click", () => $("chineseCard").classList.toggle("open"));
  }

  if ($("chNextBtn")) {
    $("chNextBtn").addEventListener("click", () => {
      chineseIndex = nextChineseIndex();
      renderChineseCard();
    });
  }

  if ($("chPrevBtn")) {
    $("chPrevBtn").addEventListener("click", () => {
      chineseIndex = previousChineseIndex();
      renderChineseCard();
    });
  }

  if ($("chLearnedBtn")) {
    $("chLearnedBtn").addEventListener("click", () => {
      if (!filteredChineseWords.length) return;

      const key = makeChineseLearnedKey(filteredChineseWords[chineseIndex]);

      if (learnedChinese.has(key)) {
        learnedChinese.delete(key);
      } else {
        learnedChinese.add(key);
      }

      saveChineseProgress();
      renderChineseCard();
    });
  }

  document.querySelectorAll(".ch-mode-btn[data-ch-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".ch-mode-btn[data-ch-mode]").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      chineseMode = button.dataset.chMode;
    });
  });

  if ($("chUnitSelect")) {
    $("chUnitSelect").addEventListener("change", () => {
      currentChineseUnit = $("chUnitSelect").value;
      chineseIndex = 0;
      updateFilteredChineseWords();
      fillChineseWordSelect();
      renderChineseCard();
    });
  }

  if ($("chWordSelect")) {
    $("chWordSelect").addEventListener("change", () => {
      chineseIndex = Number($("chWordSelect").value) || 0;
      renderChineseCard();
    });
  }

  if ($("chSearchInput")) {
    $("chSearchInput").addEventListener("input", () => {
      chineseIndex = 0;
      updateFilteredChineseWords();
      fillChineseWordSelect();
      renderChineseCard();
    });
  }

  if ($("chAllWordsBtn")) {
    $("chAllWordsBtn").addEventListener("click", () => {
      $("chineseTestBox").classList.add("hidden");
      $("chineseListBox").classList.toggle("hidden");
      renderChineseAllWordsList();
    });
  }

  if ($("chCloseListBtn")) {
    $("chCloseListBtn").addEventListener("click", () => $("chineseListBox").classList.add("hidden"));
  }

  if ($("chTestBtn")) {
    $("chTestBtn").addEventListener("click", startChineseTest);
  }

  if ($("chCloseTestBtn")) {
    $("chCloseTestBtn").addEventListener("click", () => $("chineseTestBox").classList.add("hidden"));
  }

  if ($("chNextTestBtn")) {
    $("chNextTestBtn").addEventListener("click", nextChineseTestQuestion);
  }
}

function setupSettings() {
  const settings = getSavedSettings();
  applyTheme(settings.theme, settings.color);

  if ($("saveSettingsBtn")) {
    $("saveSettingsBtn").addEventListener("click", () => {
      applyTheme($("themeSelect").value, $("colorSelect").value);
      setMessage("suggestionMessage", "Настройки сохранены.");
    });
  }

  if ($("sendSuggestionBtn")) {
    $("sendSuggestionBtn").addEventListener("click", async () => {
      const message = $("suggestionText").value.trim();

      if (!message) {
        setMessage("suggestionMessage", "Сначала напиши пожелание.", true);
        return;
      }

      if (!supabaseClient) {
        setMessage("suggestionMessage", "Supabase не подключен.", true);
        return;
      }

      const sender = appUser ? `${appUser.name} (${appUser.phone})` : "Гость";

      const { error } = await supabaseClient.from("suggestions").insert({
        user_email: sender,
        message,
        status: "new",
      });

      if (error) {
        setMessage("suggestionMessage", "Ошибка отправки: " + error.message, true);
      } else {
        $("suggestionText").value = "";
        setMessage("suggestionMessage", "Пожелание отправлено админу 💌");
      }
    });
  }
}

function boot() {
  applyTheme(getSavedSettings().theme, getSavedSettings().color);
  renderUserLine();

  setupAuth();
  setupNavigation();

  fillUnitSelect();
  updateFilteredWords();
  fillWordSelect();
  renderCard();
  setupEnglishTrainer();

  fillChineseUnitSelect();
  updateFilteredChineseWords();
  fillChineseWordSelect();
  renderChineseCard();
  setupChineseTrainer();

  setupSettings();
  updateAdminButton();

  if (appUser) {
    showScreen("homeScreen");
  } else {
    showScreen("authScreen");
  }
}

boot();