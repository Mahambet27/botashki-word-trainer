// app.js

const config = window.BOTASHKI_SUPABASE || window.SUPABASE_CONFIG || {};

const hasSupabaseConfig =
  config.url &&
  config.anonKey &&
  !config.url.includes("PASTE_") &&
  !config.anonKey.includes("PASTE_");

const supabaseClient = hasSupabaseConfig
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

let session = null;
let currentUser = null;
let profile = null;

let mode = "order";
let currentUnit = "ALL";
let filteredWords = [...WORDS];
let index = 0;
let learned = new Set(JSON.parse(localStorage.getItem("learnedWords") || "[]"));

let englishTestWords = [];
let englishTestIndex = 0;
let englishTestScore = 0;
let currentEnglishTestAnswer = null;

let chineseIndex = 0;
let chineseMode = "order";
let currentChineseUnit = "ALL";
let filteredChineseWords = [...CHINESE_WORDS];
let learnedChinese = new Set(JSON.parse(localStorage.getItem("learnedChineseWords") || "[]"));

let chineseTestWords = [];
let chineseTestIndex = 0;
let chineseTestScore = 0;
let currentChineseTestAnswer = null;

const $ = (id) => document.getElementById(id);
const screens = document.querySelectorAll(".screen");

function showScreen(id) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === id);
  });
}

function setMessage(elementId, text, isError = false) {
  const element = $(elementId);
  if (!element) return;

  element.textContent = text;
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

async function logUserAction(actionType, actionText) {
  if (!supabaseClient || !currentUser) return;

  await supabaseClient.from("user_actions").insert({
    user_id: currentUser.id,
    user_email: currentUser.email,
    action_type: actionType,
    action_text: actionText,
  });
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/* THEME */

function getSavedSettings() {
  return {
    theme: localStorage.getItem("siteTheme") || profile?.theme || "light",
    color: localStorage.getItem("siteColor") || profile?.accent_color || "blue",
  };
}

function applyTheme(theme, color) {
  document.body.classList.toggle("theme-dark", theme === "dark");

  document.body.classList.remove(
    "color-blue",
    "color-pink",
    "color-purple",
    "color-green"
  );

  document.body.classList.add(`color-${color}`);

  localStorage.setItem("siteTheme", theme);
  localStorage.setItem("siteColor", color);

  if ($("themeSelect")) $("themeSelect").value = theme;
  if ($("colorSelect")) $("colorSelect").value = color;
}

/* SUPABASE AUTH */

async function fetchProfile() {
  if (!supabaseClient || !currentUser) return null;

  let { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!data && !error) {
    const inserted = await supabaseClient
      .from("profiles")
      .insert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || "",
      })
      .select("*")
      .single();

    data = inserted.data;
  }

  profile = data || null;
  return profile;
}

async function initAuth() {
  if (!supabaseClient) {
    showScreen("authScreen");
    setMessage(
      "authMessage",
      "Сначала вставь Supabase URL и anon key в supabase-config.js",
      true
    );
    return;
  }

  const { data } = await supabaseClient.auth.getSession();

  session = data.session;
  currentUser = session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    currentUser = newSession?.user || null;

    if (currentUser) {
      await afterLogin();
    } else {
      showScreen("authScreen");
    }
  });

  if (currentUser) {
    await afterLogin();
  } else {
    showScreen("authScreen");
  }
}

async function afterLogin() {
  await fetchProfile();
  await loadRemoteEnglishProgress();
  await loadRemoteChineseProgress();

  const settings = getSavedSettings();
  applyTheme(settings.theme, settings.color);

  const name = profile?.full_name || currentUser?.email || "Botashki";
  $("userLine").textContent = `${name} · ${profile?.selected_year || 2026}`;

  $("adminOpenBtn").classList.toggle("hidden", !profile?.is_admin);

  fillUnitSelect();
  updateFilteredWords();
  fillWordSelect();
  renderCard();

  fillChineseUnitSelect();
  updateFilteredChineseWords();
  fillChineseWordSelect();
  renderChineseCard();

  renderProfile();

  await logUserAction("auth", "Пользователь вошел на сайт");

  if (!profile?.selected_year) {
    showScreen("yearScreen");
  } else {
    showScreen("homeScreen");
  }
}

function setupAuthForms() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.remove("active");
      });

      button.classList.add("active");

      const tab = button.dataset.authTab;

      $("loginForm").classList.toggle("active", tab === "login");
      $("registerForm").classList.toggle("active", tab === "register");

      setMessage("authMessage", "");
    });
  });

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("authMessage", "Ошибка входа: " + error.message, true);
    } else {
      setMessage("authMessage", "Успешный вход!");
    }
  });

  $("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    const fullName = $("registerName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setMessage("authMessage", "Ошибка регистрации: " + error.message, true);
    } else {
      setMessage(
        "authMessage",
        "Аккаунт создан. Если включено подтверждение email, открой почту."
      );
    }
  });
}

/* NAVIGATION */

function setupNavigation() {
  $("yearBtn").addEventListener("click", async () => {
    const selectedYear = Number($("yearSelect").value);

    if (supabaseClient && currentUser) {
      await supabaseClient
        .from("profiles")
        .update({
          selected_year: selectedYear,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      profile = {
        ...profile,
        selected_year: selectedYear,
      };
    }

    await logUserAction("year", `Выбрал учебный год: ${selectedYear}`);

    showScreen("welcomeScreen");

    setTimeout(() => {
      showScreen("homeScreen");
    }, 1900);
  });

  document.querySelectorAll("[data-course]").forEach((button) => {
    button.addEventListener("click", () => {
      const course = button.dataset.course;

      if (course === "english") {
        showScreen("englishScreen");
        logUserAction("course", "Открыл раздел English");
      }

      if (course === "chinese") {
        showScreen("chineseScreen");
        logUserAction("course", "Открыл раздел Chinese");
      }
    });
  });

  document.querySelectorAll("[data-back-home]").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen("homeScreen");
    });
  });

  document.querySelectorAll("[data-back-screen]").forEach((button) => {
    button.addEventListener("click", async () => {
      const screenId = button.dataset.backScreen;

      if (screenId === "authScreen" && supabaseClient && currentUser) {
        await logUserAction("auth", "Пользователь вышел из аккаунта");
        await supabaseClient.auth.signOut();
        return;
      }

      showScreen(screenId);
    });
  });

  $("profileOpenBtn").addEventListener("click", () => {
    renderProfile();
    showScreen("profileScreen");
    logUserAction("profile", "Открыл профиль");
  });

  $("settingsOpenBtn").addEventListener("click", () => {
    showScreen("settingsScreen");
    logUserAction("settings", "Открыл настройки");
  });

  $("adminOpenBtn").addEventListener("click", async () => {
    showScreen("adminScreen");
    setAdminTab("suggestions");
    await logUserAction("admin", "Открыл админ-панель");
    await loadSuggestionsForAdmin();
  });

  $("logoutBtn").addEventListener("click", async () => {
    if (supabaseClient) {
      await logUserAction("auth", "Пользователь вышел из аккаунта");
      await supabaseClient.auth.signOut();
    }

    showScreen("authScreen");
  });
}

/* PROFILE */

function renderProfile() {
  if (!currentUser) return;

  const settings = getSavedSettings();

  const name = profile?.full_name || currentUser.email || "Botashki";
  const email = currentUser.email || "No email";

  const englishLearnedCount = WORDS.filter((item) => {
    return learned.has(makeLearnedKey(item));
  }).length;

  const chineseLearnedCount = CHINESE_WORDS.filter((item) => {
    return learnedChinese.has(makeChineseLearnedKey(item));
  }).length;

  const englishPercent = getPercent(englishLearnedCount, WORDS.length);
  const chinesePercent = getPercent(chineseLearnedCount, CHINESE_WORDS.length);

  $("profileAvatar").textContent = name.trim().charAt(0).toUpperCase() || "B";
  $("profileName").textContent = name;
  $("profileEmail").textContent = email;
  $("profileYear").textContent = profile?.selected_year || 2026;

  $("profileCreated").textContent = currentUser.created_at
    ? new Date(currentUser.created_at).toLocaleDateString()
    : "—";

  $("profileTheme").textContent = settings.theme;
  $("profileColor").textContent = settings.color;

  $("profileEnglishText").textContent = `${englishLearnedCount} / ${WORDS.length} words`;
  $("profileEnglishPercent").textContent = `${englishPercent}%`;
  $("profileEnglishLine").style.width = `${englishPercent}%`;

  $("profileChineseText").textContent = `${chineseLearnedCount} / ${CHINESE_WORDS.length} words`;
  $("profileChinesePercent").textContent = `${chinesePercent}%`;
  $("profileChineseLine").style.width = `${chinesePercent}%`;
}

/* ENGLISH TRAINER */

function makeLearnedKey(item) {
  return `${item.unit || "NO_UNIT"}__${item.word}__${item.example || ""}`;
}

function saveLocalEnglishProgress() {
  localStorage.setItem("learnedWords", JSON.stringify([...learned]));
}

async function loadRemoteEnglishProgress() {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("word_key")
    .eq("user_id", currentUser.id)
    .eq("course", "english")
    .eq("learned", true);

  if (!error && data) {
    data.forEach((row) => learned.add(row.word_key));
    saveLocalEnglishProgress();
  }
}

async function saveRemoteEnglishProgress(wordKey, isLearned) {
  if (!supabaseClient || !currentUser) return;

  await supabaseClient.from("user_progress").upsert(
    {
      user_id: currentUser.id,
      course: "english",
      word_key: wordKey,
      learned: isLearned,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,course,word_key",
    }
  );
}

function getUnits() {
  const units = WORDS.map((item) => item.unit).filter(Boolean);
  return ["ALL", ...new Set(units)];
}

function fillUnitSelect() {
  const unitSelect = $("unitSelect");
  if (!unitSelect) return;

  unitSelect.innerHTML = "";

  getUnits().forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit === "ALL" ? "All Units" : unit;
    unitSelect.appendChild(option);
  });
}

function updateFilteredWords() {
  const searchText = $("searchInput")?.value.trim().toLowerCase() || "";

  let list =
    currentUnit === "ALL"
      ? [...WORDS]
      : WORDS.filter((item) => item.unit === currentUnit);

  if (searchText) {
    list = list.filter((item) => {
      return [item.unit, item.word, item.meaning, item.example, item.russian]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchText));
    });
  }

  filteredWords = list;

  if (index >= filteredWords.length) {
    index = 0;
  }
}

function fillWordSelect() {
  const wordSelect = $("wordSelect");
  if (!wordSelect) return;

  wordSelect.innerHTML = "";

  if (filteredWords.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No words found";
    wordSelect.appendChild(option);
    return;
  }

  filteredWords.forEach((item, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i + 1}. ${item.unit ? item.unit + " — " : ""}${item.word}`;
    wordSelect.appendChild(option);
  });

  wordSelect.value = index;
}

function showNoWords() {
  $("word").textContent = "No word found";
  $("backWord").textContent = "No word found";
  $("meaning").textContent = "This word is not in words.js.";
  $("example").textContent = "";
  $("russian").textContent = "";

  $("unitLabel").textContent = currentUnit === "ALL" ? "ALL UNITS" : currentUnit;
  $("backUnitLabel").textContent = currentUnit === "ALL" ? "ALL UNITS" : currentUnit;

  $("currentNumber").textContent = "0";
  $("totalNumber").textContent = "0";
  $("learnedNumber").textContent = "0";

  $("progressLine").style.width = "0%";
  $("card").classList.remove("open");
}

function getCurrentWord() {
  return filteredWords[index];
}

function renderCard() {
  if (filteredWords.length === 0) {
    showNoWords();
    renderEnglishAllWordsList();
    return;
  }

  const item = getCurrentWord();
  const wordKey = makeLearnedKey(item);
  const isLearned = learned.has(wordKey);

  $("word").textContent = item.word;
  $("backWord").textContent = item.word;

  $("meaning").textContent = item.meaning || "";
  $("example").textContent = item.example || "";
  $("russian").textContent = item.russian || "";

  $("unitLabel").textContent = item.unit || "NO UNIT";
  $("backUnitLabel").textContent = item.unit || "NO UNIT";

  $("currentNumber").textContent = index + 1;
  $("totalNumber").textContent = filteredWords.length;

  const learnedInCurrentList = filteredWords.filter((item) => {
    return learned.has(makeLearnedKey(item));
  }).length;

  $("learnedNumber").textContent = learnedInCurrentList;

  const percent =
    filteredWords.length === 0
      ? 0
      : (learnedInCurrentList / filteredWords.length) * 100;

  $("progressLine").style.width = `${percent}%`;

  $("learnedBtn").textContent = isLearned ? "Уже выучила ✓" : "Выучила";

  $("wordSelect").value = index;
  $("card").classList.remove("open");

  renderEnglishAllWordsList();
  renderProfile();
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
  const listBox = $("englishAllWordsList");
  if (!listBox) return;

  if (!filteredWords.length) {
    listBox.innerHTML = `<p class="subtitle">Слова не найдены.</p>`;
    return;
  }

  listBox.innerHTML = filteredWords
    .map((item, i) => {
      const key = makeLearnedKey(item);
      const learnedClass = learned.has(key) ? " learned" : "";

      return `
        <button class="word-list-item english-list-item${learnedClass}" data-en-list-index="${i}">
          <span class="word-list-number">${i + 1}</span>
          <span class="word-list-hanzi">${escapeHtml(item.word)}</span>
          <span class="word-list-info">
            <strong>${escapeHtml(item.meaning)}</strong>
            <small>${escapeHtml(item.russian)} · ${escapeHtml(item.unit || "")}</small>
          </span>
        </button>
      `;
    })
    .join("");

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

  if (englishTestWords.length === 0) {
    setMessage("englishTestMessage", "Нет слов для теста.", true);
    return;
  }

  $("englishListBox").classList.add("hidden");
  $("englishTestBox").classList.remove("hidden");

  renderEnglishTestQuestion();
}

function renderEnglishTestQuestion() {
  const item = englishTestWords[englishTestIndex];
  currentEnglishTestAnswer = item.meaning;

  $("englishTestCounter").textContent = `Question ${englishTestIndex + 1}/${englishTestWords.length}`;
  $("englishTestWord").textContent = item.word;
  $("englishTestMessage").textContent = "";
  $("englishTestMessage").classList.remove("error");
  $("englishNextTestBtn").classList.add("hidden");

  const wrongAnswers = shuffleArray(
    WORDS
      .filter((word) => word.meaning && word.meaning !== item.meaning)
      .map((word) => word.meaning)
  ).slice(0, 3);

  const options = shuffleArray([item.meaning, ...wrongAnswers]);

  $("englishTestOptions").innerHTML = options
    .map((option) => {
      return `<button class="test-option" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
    })
    .join("");

  document.querySelectorAll("#englishTestOptions .test-option").forEach((button) => {
    button.addEventListener("click", () => {
      checkEnglishTestAnswer(button.dataset.answer);
    });
  });
}

function checkEnglishTestAnswer(answer) {
  const isCorrect = answer === currentEnglishTestAnswer;

  if (isCorrect) {
    englishTestScore++;
    setMessage("englishTestMessage", "Правильно ✅");
  } else {
    setMessage(
      "englishTestMessage",
      `Неправильно ❌ Correct answer: ${currentEnglishTestAnswer}`,
      true
    );
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

    if (englishTestScore >= 8) {
      setMessage("englishTestMessage", "Excellent 🔥");
    } else if (englishTestScore >= 5) {
      setMessage("englishTestMessage", "Good, but repeat more 💪");
    } else {
      setMessage("englishTestMessage", "Repeat the words again 📚", true);
    }

    $("englishNextTestBtn").classList.add("hidden");
    return;
  }

  renderEnglishTestQuestion();
}

function setupEnglishTrainer() {
  $("card").addEventListener("click", () => {
    $("card").classList.toggle("open");
  });

  $("nextBtn").addEventListener("click", () => {
    if (filteredWords.length === 0) return;
    index = nextIndex();
    renderCard();
  });

  $("prevBtn").addEventListener("click", () => {
    if (filteredWords.length === 0) return;
    index = previousIndex();
    renderCard();
  });

  $("learnedBtn").addEventListener("click", async () => {
    if (filteredWords.length === 0) return;

    const item = getCurrentWord();
    const key = makeLearnedKey(item);
    const isLearned = learned.has(key);

    if (isLearned) {
      learned.delete(key);
    } else {
      learned.add(key);
    }

    saveLocalEnglishProgress();
    await saveRemoteEnglishProgress(key, !isLearned);
    await logUserAction(
      "progress",
      `${!isLearned ? "Выучил" : "Убрал из выученных"} English word: ${item.word}`
    );

    renderCard();
  });

  $("resetBtn").addEventListener("click", async () => {
    if (!confirm("Сбросить локальный прогресс English?")) return;

    learned.clear();
    saveLocalEnglishProgress();
    await logUserAction("progress", "Сбросил локальный прогресс English");
    renderCard();
  });

  document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
        btn.classList.remove("active");
      });

      button.classList.add("active");
      mode = button.dataset.mode;
    });
  });

  $("unitSelect").addEventListener("change", () => {
    currentUnit = $("unitSelect").value;
    index = 0;
    updateFilteredWords();
    fillWordSelect();
    renderCard();
  });

  $("wordSelect").addEventListener("change", () => {
    index = Number($("wordSelect").value) || 0;
    renderCard();
  });

  $("searchInput").addEventListener("input", () => {
    index = 0;
    updateFilteredWords();
    fillWordSelect();
    renderCard();
  });

  $("englishAllWordsBtn").addEventListener("click", () => {
    $("englishTestBox").classList.add("hidden");
    $("englishListBox").classList.toggle("hidden");
    renderEnglishAllWordsList();
    logUserAction("english", "Открыл список всех English слов");
  });

  $("englishCloseListBtn").addEventListener("click", () => {
    $("englishListBox").classList.add("hidden");
  });

  $("englishTestBtn").addEventListener("click", () => {
    startEnglishTest();
    logUserAction("test", "Начал English test");
  });

  $("englishCloseTestBtn").addEventListener("click", () => {
    $("englishTestBox").classList.add("hidden");
  });

  $("englishNextTestBtn").addEventListener("click", () => {
    nextEnglishTestQuestion();
  });
}

/* CHINESE TRAINER */

function makeChineseLearnedKey(item) {
  return `${item.unit || "UNIT-1"}__${item.hanzi}__${item.pinyin}`;
}

function saveChineseProgress() {
  localStorage.setItem("learnedChineseWords", JSON.stringify([...learnedChinese]));
}

async function loadRemoteChineseProgress() {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("word_key")
    .eq("user_id", currentUser.id)
    .eq("course", "chinese")
    .eq("learned", true);

  if (!error && data) {
    data.forEach((row) => learnedChinese.add(row.word_key));
    saveChineseProgress();
  }
}

async function saveRemoteChineseProgress(wordKey, isLearned) {
  if (!supabaseClient || !currentUser) return;

  await supabaseClient.from("user_progress").upsert(
    {
      user_id: currentUser.id,
      course: "chinese",
      word_key: wordKey,
      learned: isLearned,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,course,word_key",
    }
  );
}

function getChineseUnits() {
  const units = CHINESE_WORDS.map((item) => item.unit || "UNIT-1").filter(Boolean);
  return ["ALL", ...new Set(units)];
}

function fillChineseUnitSelect() {
  const chUnitSelect = $("chUnitSelect");
  if (!chUnitSelect) return;

  chUnitSelect.innerHTML = "";

  getChineseUnits().forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit === "ALL" ? "All Units" : unit;
    chUnitSelect.appendChild(option);
  });
}

function updateFilteredChineseWords() {
  const searchText = $("chSearchInput")?.value.trim().toLowerCase() || "";

  let list =
    currentChineseUnit === "ALL"
      ? [...CHINESE_WORDS]
      : CHINESE_WORDS.filter((item) => (item.unit || "UNIT-1") === currentChineseUnit);

  if (searchText) {
    list = list.filter((item) => {
      return [
        item.unit,
        item.hanzi,
        item.pinyin,
        item.meaning,
        item.example,
        item.russian,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchText));
    });
  }

  filteredChineseWords = list;

  if (chineseIndex >= filteredChineseWords.length) {
    chineseIndex = 0;
  }
}

function fillChineseWordSelect() {
  const chWordSelect = $("chWordSelect");
  if (!chWordSelect) return;

  chWordSelect.innerHTML = "";

  if (filteredChineseWords.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No words found";
    chWordSelect.appendChild(option);
    return;
  }

  filteredChineseWords.forEach((item, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i + 1}. ${item.hanzi} — ${item.pinyin}`;
    chWordSelect.appendChild(option);
  });

  chWordSelect.value = chineseIndex;
}

function showNoChineseWords() {
  $("chUnit").textContent = currentChineseUnit === "ALL" ? "ALL UNITS" : currentChineseUnit;
  $("chBackUnit").textContent = currentChineseUnit === "ALL" ? "ALL UNITS" : currentChineseUnit;

  $("chHanzi").textContent = "No word";
  $("chBackHanzi").textContent = "No word";

  $("chPinyin").textContent = "";
  $("chBackPinyin").textContent = "";

  $("chMeaning").textContent = "This word is not found.";
  $("chExample").textContent = "";
  $("chRussian").textContent = "";

  $("chCurrentNumber").textContent = "0";
  $("chTotalNumber").textContent = "0";
  $("chLearnedNumber").textContent = "0";
  $("chProgressLine").style.width = "0%";

  $("chineseCard").classList.remove("open");
}

function getCurrentChineseWord() {
  return filteredChineseWords[chineseIndex];
}

function renderChineseCard() {
  if (!filteredChineseWords || filteredChineseWords.length === 0) {
    showNoChineseWords();
    renderChineseAllWordsList();
    return;
  }

  const item = getCurrentChineseWord();
  const key = makeChineseLearnedKey(item);
  const isLearned = learnedChinese.has(key);

  $("chUnit").textContent = item.unit || "UNIT-1";
  $("chBackUnit").textContent = item.unit || "UNIT-1";

  $("chHanzi").textContent = item.hanzi || "";
  $("chBackHanzi").textContent = item.hanzi || "";

  $("chPinyin").textContent = item.pinyin || "";
  $("chBackPinyin").textContent = item.pinyin || "";

  $("chMeaning").textContent = item.meaning || "";
  $("chExample").textContent = item.example || "";
  $("chRussian").textContent = item.russian || "";

  $("chCurrentNumber").textContent = chineseIndex + 1;
  $("chTotalNumber").textContent = filteredChineseWords.length;

  const learnedInCurrentList = filteredChineseWords.filter((word) => {
    return learnedChinese.has(makeChineseLearnedKey(word));
  }).length;

  $("chLearnedNumber").textContent = learnedInCurrentList;

  const percent =
    filteredChineseWords.length === 0
      ? 0
      : (learnedInCurrentList / filteredChineseWords.length) * 100;

  $("chProgressLine").style.width = `${percent}%`;

  $("chLearnedBtn").textContent = isLearned ? "Уже выучила ✓" : "Выучила";

  if ($("chWordSelect")) {
    $("chWordSelect").value = chineseIndex;
  }

  $("chineseCard").classList.remove("open");

  renderChineseAllWordsList();
  renderProfile();
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
  const listBox = $("chineseAllWordsList");
  if (!listBox) return;

  if (!filteredChineseWords.length) {
    listBox.innerHTML = `<p class="subtitle">Слова не найдены.</p>`;
    return;
  }

  listBox.innerHTML = filteredChineseWords
    .map((item, i) => {
      const key = makeChineseLearnedKey(item);
      const learnedClass = learnedChinese.has(key) ? " learned" : "";

      return `
        <button class="word-list-item${learnedClass}" data-ch-list-index="${i}">
          <span class="word-list-number">${i + 1}</span>
          <span class="word-list-hanzi">${escapeHtml(item.hanzi)}</span>
          <span class="word-list-info">
            <strong>${escapeHtml(item.pinyin)}</strong>
            <small>${escapeHtml(item.meaning)} · ${escapeHtml(item.russian)}</small>
          </span>
        </button>
      `;
    })
    .join("");

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

  if (chineseTestWords.length === 0) {
    setMessage("chTestMessage", "Нет слов для теста.", true);
    return;
  }

  $("chineseListBox").classList.add("hidden");
  $("chineseTestBox").classList.remove("hidden");

  renderChineseTestQuestion();
}

function renderChineseTestQuestion() {
  const item = chineseTestWords[chineseTestIndex];
  currentChineseTestAnswer = item.meaning;

  $("chTestCounter").textContent = `Вопрос ${chineseTestIndex + 1}/${chineseTestWords.length}`;
  $("chTestHanzi").textContent = item.hanzi;
  $("chTestPinyin").textContent = item.pinyin;
  $("chTestMessage").textContent = "";
  $("chTestMessage").classList.remove("error");
  $("chNextTestBtn").classList.add("hidden");

  const wrongAnswers = shuffleArray(
    CHINESE_WORDS
      .filter((word) => word.meaning !== item.meaning)
      .map((word) => word.meaning)
  ).slice(0, 3);

  const options = shuffleArray([item.meaning, ...wrongAnswers]);

  $("chTestOptions").innerHTML = options
    .map((option) => {
      return `<button class="test-option" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
    })
    .join("");

  document.querySelectorAll("#chTestOptions .test-option").forEach((button) => {
    button.addEventListener("click", () => {
      checkChineseTestAnswer(button.dataset.answer);
    });
  });
}

function checkChineseTestAnswer(answer) {
  const isCorrect = answer === currentChineseTestAnswer;

  if (isCorrect) {
    chineseTestScore++;
    setMessage("chTestMessage", "Правильно ✅");
  } else {
    setMessage(
      "chTestMessage",
      `Неправильно ❌ Правильный ответ: ${currentChineseTestAnswer}`,
      true
    );
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

    if (chineseTestScore >= 8) {
      setMessage("chTestMessage", "Отлично 🔥");
    } else if (chineseTestScore >= 5) {
      setMessage("chTestMessage", "Нормально, но можно лучше 💪");
    } else {
      setMessage("chTestMessage", "Нужно еще повторить слова 📚", true);
    }

    $("chNextTestBtn").classList.add("hidden");
    return;
  }

  renderChineseTestQuestion();
}

function setupChineseTrainer() {
  $("chineseCard").addEventListener("click", () => {
    $("chineseCard").classList.toggle("open");
  });

  fillChineseUnitSelect();
  updateFilteredChineseWords();
  fillChineseWordSelect();
  renderChineseCard();

  $("chNextBtn").addEventListener("click", () => {
    if (filteredChineseWords.length === 0) return;

    chineseIndex = nextChineseIndex();
    renderChineseCard();
  });

  $("chPrevBtn").addEventListener("click", () => {
    if (filteredChineseWords.length === 0) return;

    chineseIndex = previousChineseIndex();
    renderChineseCard();
  });

  $("chLearnedBtn").addEventListener("click", async () => {
    if (filteredChineseWords.length === 0) return;

    const item = getCurrentChineseWord();
    const key = makeChineseLearnedKey(item);
    const isLearned = learnedChinese.has(key);

    if (isLearned) {
      learnedChinese.delete(key);
    } else {
      learnedChinese.add(key);
    }

    saveChineseProgress();
    await saveRemoteChineseProgress(key, !isLearned);
    await logUserAction(
      "progress",
      `${!isLearned ? "Выучил" : "Убрал из выученных"} Chinese word: ${item.hanzi}`
    );

    renderChineseCard();
  });

  document.querySelectorAll(".ch-mode-btn[data-ch-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".ch-mode-btn[data-ch-mode]").forEach((btn) => {
        btn.classList.remove("active");
      });

      button.classList.add("active");
      chineseMode = button.dataset.chMode;
    });
  });

  $("chUnitSelect").addEventListener("change", () => {
    currentChineseUnit = $("chUnitSelect").value;
    chineseIndex = 0;

    updateFilteredChineseWords();
    fillChineseWordSelect();
    renderChineseCard();
  });

  $("chWordSelect").addEventListener("change", () => {
    chineseIndex = Number($("chWordSelect").value) || 0;
    renderChineseCard();
  });

  $("chSearchInput").addEventListener("input", () => {
    chineseIndex = 0;

    updateFilteredChineseWords();
    fillChineseWordSelect();
    renderChineseCard();
  });

  $("chAllWordsBtn").addEventListener("click", () => {
    $("chineseTestBox").classList.add("hidden");
    $("chineseListBox").classList.toggle("hidden");
    renderChineseAllWordsList();
    logUserAction("chinese", "Открыл список всех Chinese слов");
  });

  $("chCloseListBtn").addEventListener("click", () => {
    $("chineseListBox").classList.add("hidden");
  });

  $("chTestBtn").addEventListener("click", () => {
    startChineseTest();
    logUserAction("test", "Начал Chinese test");
  });

  $("chCloseTestBtn").addEventListener("click", () => {
    $("chineseTestBox").classList.add("hidden");
  });

  $("chNextTestBtn").addEventListener("click", () => {
    nextChineseTestQuestion();
  });
}

/* SETTINGS */

function setupSettings() {
  const settings = getSavedSettings();
  applyTheme(settings.theme, settings.color);

  $("saveSettingsBtn").addEventListener("click", async () => {
    const theme = $("themeSelect").value;
    const color = $("colorSelect").value;

    applyTheme(theme, color);
    renderProfile();

    if (supabaseClient && currentUser) {
      const { error } = await supabaseClient
        .from("profiles")
        .update({
          theme,
          accent_color: color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (error) {
        setMessage(
          "suggestionMessage",
          "Настройки локально сохранены, но Supabase не обновился.",
          true
        );
      } else {
        profile = {
          ...profile,
          theme,
          accent_color: color,
        };

        await logUserAction("settings", `Изменил настройки: theme=${theme}, color=${color}`);
        setMessage("suggestionMessage", "Настройки сохранены.");
      }
    }
  });

  $("sendSuggestionBtn").addEventListener("click", async () => {
    const message = $("suggestionText").value.trim();

    if (!message) {
      setMessage("suggestionMessage", "Сначала напиши пожелание.", true);
      return;
    }

    if (!supabaseClient || !currentUser) {
      setMessage("suggestionMessage", "Нужно войти через Supabase.", true);
      return;
    }

    const { error } = await supabaseClient.from("suggestions").insert({
      user_id: currentUser.id,
      user_email: currentUser.email,
      message,
    });

    if (error) {
      setMessage("suggestionMessage", "Ошибка отправки: " + error.message, true);
    } else {
      $("suggestionText").value = "";
      await logUserAction("suggestion", "Пользователь отправил пожелание админу");
      setMessage("suggestionMessage", "Пожелание отправлено админу 💌");
    }
  });
}

/* ADMIN */

function setupAdminTabs() {
  const suggestionsTab = $("adminSuggestionsTab");
  const usersTab = $("adminUsersTab");
  const actionsTab = $("adminActionsTab");

  if (!suggestionsTab || !usersTab || !actionsTab) return;

  suggestionsTab.addEventListener("click", async () => {
    setAdminTab("suggestions");
    await loadSuggestionsForAdmin();
  });

  usersTab.addEventListener("click", async () => {
    setAdminTab("users");
    await loadUsersForAdmin();
  });

  actionsTab.addEventListener("click", async () => {
    setAdminTab("actions");
    await loadActionsForAdmin();
  });

  $("refreshSuggestionsBtn").addEventListener("click", loadSuggestionsForAdmin);
  $("refreshUsersBtn").addEventListener("click", loadUsersForAdmin);
  $("refreshActionsBtn").addEventListener("click", loadActionsForAdmin);
}

function setAdminTab(tab) {
  $("adminSuggestionsTab").classList.toggle("active", tab === "suggestions");
  $("adminUsersTab").classList.toggle("active", tab === "users");
  $("adminActionsTab").classList.toggle("active", tab === "actions");

  $("adminSuggestionsBox").classList.toggle("hidden", tab !== "suggestions");
  $("adminUsersBox").classList.toggle("hidden", tab !== "users");
  $("adminActionsBox").classList.toggle("hidden", tab !== "actions");
}

async function loadSuggestionsForAdmin() {
  const container = $("suggestionsList");

  if (!supabaseClient || !profile?.is_admin) {
    container.textContent = "Нет доступа.";
    return;
  }

  container.textContent = "Загрузка...";

  const { data, error } = await supabaseClient
    .from("suggestions")
    .select("id, user_email, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    container.textContent = "Ошибка загрузки: " + error.message;
    return;
  }

  if (!data || !data.length) {
    container.textContent = "Пожеланий пока нет.";
    return;
  }

  container.innerHTML = data
    .map((item) => {
      const status = item.status || "new";
      const statusText = status === "done" ? "Выполнено" : "Новое";

      return `
        <div class="admin-item ${status === "done" ? "done" : ""}">
          <div class="admin-item-top">
            <strong>${escapeHtml(item.user_email || "unknown")}</strong>
            <span class="status-badge ${status === "done" ? "done" : ""}">${statusText}</span>
          </div>

          <p>${escapeHtml(item.message)}</p>

          <small>${new Date(item.created_at).toLocaleString()}</small>

          <div class="admin-actions">
            <button class="small-btn done-btn" data-done-id="${item.id}">
              ✓ Выполнено
            </button>

            <button class="small-btn danger-btn" data-delete-id="${item.id}">
              🗑 Удалить
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-done-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await markSuggestionDone(button.dataset.doneId);
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteSuggestion(button.dataset.deleteId);
    });
  });
}

async function markSuggestionDone(id) {
  if (!supabaseClient || !profile?.is_admin) return;

  const { error } = await supabaseClient
    .from("suggestions")
    .update({ status: "done" })
    .eq("id", id);

  if (error) {
    alert("Ошибка: " + error.message);
    return;
  }

  await logUserAction("admin", "Админ отметил пожелание как выполненное");
  await loadSuggestionsForAdmin();
}

async function deleteSuggestion(id) {
  if (!supabaseClient || !profile?.is_admin) return;

  const ok = confirm("Удалить это пожелание?");
  if (!ok) return;

  const { error } = await supabaseClient
    .from("suggestions")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Ошибка: " + error.message);
    return;
  }

  await logUserAction("admin", "Админ удалил пожелание");
  await loadSuggestionsForAdmin();
}

async function loadUsersForAdmin() {
  const container = $("usersList");

  if (!supabaseClient || !profile?.is_admin) {
    container.textContent = "Нет доступа.";
    return;
  }

  container.textContent = "Загрузка...";

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, selected_year, theme, accent_color, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    container.textContent = "Ошибка загрузки пользователей: " + error.message;
    return;
  }

  if (!data || !data.length) {
    container.textContent = "Пользователей пока нет.";
    return;
  }

  container.innerHTML = data
    .map((user) => {
      const name = user.full_name || "Без имени";
      const year = user.selected_year || "—";
      const theme = user.theme || "light";
      const color = user.accent_color || "blue";
      const adminLabel = user.is_admin ? `<span class="status-badge done">Admin</span>` : "";

      return `
        <div class="admin-item">
          <div class="admin-item-top">
            <strong>${escapeHtml(name)}</strong>
            ${adminLabel}
          </div>

          <p>${escapeHtml(user.email || "no email")}</p>

          <div class="user-meta-grid">
            <div>
              <small>Год</small>
              <b>${escapeHtml(year)}</b>
            </div>

            <div>
              <small>Тема</small>
              <b>${escapeHtml(theme)}</b>
            </div>

            <div>
              <small>Цвет</small>
              <b>${escapeHtml(color)}</b>
            </div>

            <div>
              <small>Дата</small>
              <b>${user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</b>
            </div>
          </div>

          <div class="admin-actions one">
            <button class="small-btn reset-btn" data-reset-email="${escapeHtml(user.email || "")}">
              🔑 Сбросить пароль
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-reset-email]").forEach((button) => {
    button.addEventListener("click", async () => {
      const email = button.dataset.resetEmail;
      await sendPasswordReset(email);
    });
  });
}

async function sendPasswordReset(email) {
  if (!email) {
    alert("Email пользователя не найден.");
    return;
  }

  const ok = confirm(`Отправить письмо для сброса пароля на ${email}?`);
  if (!ok) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  if (error) {
    alert("Ошибка: " + error.message);
    return;
  }

  await logUserAction("admin", `Админ отправил сброс пароля для ${email}`);
  alert("Письмо для сброса пароля отправлено.");
}

async function loadActionsForAdmin() {
  const container = $("actionsList");

  if (!supabaseClient || !profile?.is_admin) {
    container.textContent = "Нет доступа.";
    return;
  }

  container.textContent = "Загрузка...";

  const { data, error } = await supabaseClient
    .from("user_actions")
    .select("id, user_email, action_type, action_text, created_at")
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    container.textContent = "Ошибка загрузки действий: " + error.message;
    return;
  }

  if (!data || !data.length) {
    container.textContent = "Действий пока нет.";
    return;
  }

  container.innerHTML = data
    .map((item) => {
      return `
        <div class="admin-item">
          <div class="admin-item-top">
            <strong>${escapeHtml(item.user_email || "unknown")}</strong>
            <span class="status-badge">${escapeHtml(item.action_type)}</span>
          </div>

          <p>${escapeHtml(item.action_text)}</p>

          <small>${new Date(item.created_at).toLocaleString()}</small>
        </div>
      `;
    })
    .join("");
}

/* BOOT */

function boot() {
  setupAuthForms();
  setupNavigation();
  setupEnglishTrainer();
  setupChineseTrainer();
  setupSettings();
  setupAdminTabs();
  initAuth();
}

boot();