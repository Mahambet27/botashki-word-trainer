# Боташки Word Trainer + Supabase

Готовая версия сайта с:

- регистрацией и входом через Supabase Auth;
- выбором учебного года 2026;
- приветственной анимацией «Добро пожаловать на сайт Боташки»;
- двумя курсами: Английский и Китайский;
- английским Word Trainer на основе `words.js`;
- отдельным файлом `chinese.js` для китайского курса;
- настройками темы: светлая / темная;
- выбором цвета сайта;
- разделом пожеланий, которые сохраняются в Supabase и видны админу;
- сохранением прогресса слов локально и в Supabase.

## 1. Создай проект Supabase

1. Зайди в Supabase.
2. Создай New Project.
3. Открой SQL Editor.
4. Вставь весь код из `database.sql`.
5. Нажми Run.

## 2. Подключи сайт к Supabase

Открой `supabase-config.js` и замени:

```js
url: "PASTE_YOUR_SUPABASE_URL_HERE",
anonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
```

на свои данные из:

Supabase → Project Settings → API → Project URL и anon public key.

## 3. Запусти сайт

В VS Code:

1. Открой папку проекта.
2. Установи Live Server.
3. Нажми правой кнопкой на `index.html`.
4. Выбери Open with Live Server.

## 4. Сделай себя админом

Сначала зарегистрируйся на сайте.

Потом в Supabase → SQL Editor запусти:

```sql
update public.profiles
set is_admin = true
where email = 'mahagim.bet.box@gmail.com';
```

После этого выйди и зайди снова. На главной появится кнопка «Админ: пожелания».

## 5. Если вход не работает из-за email confirmation

В Supabase можно временно выключить подтверждение email:

Authentication → Providers → Email → Confirm email = OFF.

Или оставь включенным, тогда после регистрации нужно открыть письмо и подтвердить email.

## 6. Как добавить английские слова

Открой `words.js` и добавляй слова в формате:

```js
{ unit: "UNIT-1", word: "example", meaning: "meaning", example: "Example sentence.", russian: "перевод" }
```

## 7. Как добавить китайские слова

Открой `chinese.js` и добавляй:

```js
{
  unit: "HSK-1",
  hanzi: "老师",
  pinyin: "lǎoshī",
  meaning: "teacher",
  example: "老师好！",
  russian: "учитель"
}
```
