    const SUPABASE_URL = "https://rqtqimjenotjspqumeni.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_LOzTBbVK8tg6kDOrO8AcrQ_j52hzXTf";
    const GOOGLE_BOOKS_API_KEY = "AIzaSyAisvc1YIhHWofTe45-ESHF0JVp9t92Oys";
    const TMDB_API_KEY = "fc8eab333882a74fe8c8a633e4676d98";

    const supabaseClient = supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    const translations = {
      en: {
        subtitle: "Personal Library and Media Universe Tracker",
        auth: {
          loginTitle: "Plamut Login",
          text: "Save books, movies, series, anime and manga in one personal library.",
          email: "Email",
          password: "Password",
          login: "Login",
          register: "Register"
        },
        topbar: {
          profile: "Profile",
          login: "Login",
          logout: "Logout",
          shareLibrary: "Share Library",
          interface: "Interface",
          language: "Language",
          theme: "Theme",
          themeLight: "Light",
          themeDark: "Dark",
          themeSystem: "System"
        },
        profile: {
          title: "Profile",
          subtitle: "Manage your account settings, privacy, avatar and password.",
          avatarTitle: "Avatar",
          avatarHint: "Upload a profile image so your account is easier to recognize.",
          accountTitle: "Account",
          usernameLabel: "Username",
          username: "Username",
          displayNameLabel: "Display name",
          displayName: "Display name",
          privacyTitle: "Privacy",
          privacyHint: "Control whether other users can open your public library page.",
          publicLibrary: "Public library",
          securityTitle: "Security",
          securityHint: "Change your password and save it securely for future sign-ins.",
          newPassword: "New password",
          confirmPassword: "Confirm password",
          showPassword: "Show password",
          changePassword: "Change password",
          uploadAvatar: "Upload avatar",
          removeAvatar: "Remove avatar",
          organizationTitle: "Custom organization",
          organizationHint: "Create personal statuses and folders for your account.",
          customStatusLabel: "Custom statuses",
          customFolderLabel: "Custom folders",
          addStatus: "Add status",
          addFolder: "Add folder",
          logout: "Logout",
          close: "Close",
          save: "Save Profile",
          saved: "Profile saved",
          passwordSaved: "Password updated",
          passwordRequired: "Enter a new password",
          passwordTooShort: "Password must be at least 6 characters",
          passwordMismatch: "Passwords do not match",
          avatarSelectFirst: "Select an image first",
          avatarUpdated: "Avatar updated",
          avatarRemoved: "Avatar removed",
          customStatusAdded: "Custom status added",
          customFolderAdded: "Custom folder added",
          customStatusExists: "This status already exists",
          customFolderExists: "This folder already exists",
          customValueRequired: "Enter a name first",
          customRemoved: "Removed"
        },
        categories: {
          Books: "📚 Books",
          Movies: "🎬 Movies",
          Series: "📺 Series",
          Anime: "🍥 Anime",
          Manga: "📖 Manga",
          Blacklist: "🚫 Blacklist"
        },
        buttons: {
          backHome: "← Back",
          addNew: "+ Add new",
          addPrimary: "Add",
          addFolder: "+ Add folder",
          addToFolder: "Add to folder",
          moreActions: "More actions",
          backShelf: "← Back to shelf",
          close: "Close",
          changeStatus: "Change status",
          open: "Open",
          add: "Add",
          cancel: "Cancel",
          manualAdd: "Add manually",
          save: "Save",
          delete: "Delete",
          moveToBlacklist: "Move to blacklist"
        },
        modals: {
          searchTitle: "Search and add",
          searchSubtitle: "Search works by category API. Query is tried in Russian and English.",
          searchPlaceholder: "Enter title or author",
          statusTitle: "Select status",
          manualTitle: "Add manually",
          manualSubtitle: "Use this when search does not find what you need."
        },
        labels: {
          cover: "Cover",
          description: "Description",
          noResults: "No results found",
          alreadyExists: "This item is already on the shelf.",
          itemNotFound: "Item not found on shelf.",
          statusLabel: "Status",
          searching: "Searching...",
          noBooksFound: "No results found",
          apiError: "API error",
          dbSaveError: "Error saving item to database",
          dbUpdateError: "Supabase update error",
          dbStatusNotSaved: "Status was not saved to database",
          name: "Title",
          creator: "Author / Director / Studio",
          coverUrl: "Cover URL",
          descriptionPlaceholder: "Description",
          manualNameRequired: "Title is required",
          noDescription: "No description available.",
          canonicalKey: "Canonical Key",
          canonicalSaved: "Canonical key saved",
          canonicalSaveError: "Error saving canonical key",
          mustBeLoggedIn: "You must be logged in",
          setUsernameFirst: "Set username first",
          libraryLinkCopied: "Library link copied:",
          userCreatedCheckEmail: "User created. Check your email.",
          profileLookupError: "Profile lookup error",
          userNotFound: "User not found",
          libraryPrivate: "Library is private",
          unknownStatus: "Unknown",
          confirmDelete: "Delete this item?",
          deleteError: "Could not delete item",
          confirmMoveToBlacklist: "Move this item to blacklist?",
          moveError: "Could not move item",
          filterByStatus: "Filter by status",
          filterByFolder: "Filter by folder",
          allStatuses: "All statuses",
          allFolders: "All folders",
          folder: "Folder",
          noFolder: "No folder",
          saveFolder: "Save folder",
          folderSaved: "Folder saved",
          relatedWorks: "Related works",
          relatedWorksEmpty: "No related works found yet.",
          runtimeError: "Application error. Please refresh the page. Details:"
        },
        statuses: {
          All: "All statuses",
          Planned: "Planned",
          "In progress": "In progress",
          Done: "Done",
          Dropped: "Dropped",
          Info: "Info"
        },
        categoryNames: {
          Books: "Books",
          Movies: "Movies",
          Series: "Series",
          Anime: "Anime",
          Manga: "Manga",
          Blacklist: "Blacklist"
        },
        home: {
          heroBadge: "Your personal universe",
          libraryTitle: "Library",
          libraryNote: "Choose a category",
          quickAddTitle: "Quick add",
          quickAddNote: "Choose a category and jump straight into adding."
        },
        brand: {
          subtitle: "Media Tracker"
        }
      },
      ru: {
        subtitle: "Персональная библиотека и трекер медиа-вселенных",
        auth: {
          loginTitle: "Вход в Plamut",
          text: "Сохраняйте книги, фильмы, сериалы, аниме и мангу в одной личной библиотеке.",
          email: "Почта",
          password: "Пароль",
          login: "Войти",
          register: "Регистрация"
        },
        topbar: {
          profile: "Профиль",
          login: "Войти",
          logout: "Выйти",
          shareLibrary: "Поделиться библиотекой",
          interface: "Интерфейс",
          language: "Язык",
          theme: "Тема",
          themeLight: "Светлая",
          themeDark: "Тёмная",
          themeSystem: "Системная"
        },
        profile: {
          title: "Профиль",
          subtitle: "Управляйте настройками аккаунта, приватностью, аватаром и паролем.",
          avatarTitle: "Аватар",
          avatarHint: "Загрузите изображение профиля, чтобы аккаунт было проще узнать.",
          accountTitle: "Аккаунт",
          usernameLabel: "Username",
          username: "Username",
          displayNameLabel: "Отображаемое имя",
          displayName: "Отображаемое имя",
          privacyTitle: "Приватность",
          privacyHint: "Управляйте тем, могут ли другие пользователи открывать вашу публичную библиотеку.",
          publicLibrary: "Публичная библиотека",
          securityTitle: "Безопасность",
          securityHint: "Измените пароль и сохраните его для следующих входов.",
          newPassword: "Новый пароль",
          confirmPassword: "Подтвердите пароль",
          showPassword: "Показать пароль",
          changePassword: "Изменить пароль",
          uploadAvatar: "Загрузить аватар",
          removeAvatar: "Удалить аватар",
          organizationTitle: "Пользовательская организация",
          organizationHint: "Создавайте свои статусы и папки для аккаунта.",
          customStatusLabel: "Пользовательские статусы",
          customFolderLabel: "Пользовательские папки",
          addStatus: "Добавить статус",
          addFolder: "Добавить папку",
          logout: "Выйти",
          close: "Закрыть",
          save: "Сохранить профиль",
          saved: "Профиль сохранён",
          passwordSaved: "Пароль обновлён",
          passwordRequired: "Введите новый пароль",
          passwordTooShort: "Пароль должен содержать минимум 6 символов",
          passwordMismatch: "Пароли не совпадают",
          avatarSelectFirst: "Сначала выберите изображение",
          avatarUpdated: "Аватар обновлён",
          avatarRemoved: "Аватар удалён",
          customStatusAdded: "Пользовательский статус добавлен",
          customFolderAdded: "Пользовательская папка добавлена",
          customStatusExists: "Такой статус уже существует",
          customFolderExists: "Такая папка уже существует",
          customValueRequired: "Сначала введите название",
          customRemoved: "Удалено"
        },
        categories: {
          Books: "📚 Книги",
          Movies: "🎬 Фильмы",
          Series: "📺 Сериалы",
          Anime: "🍥 Аниме",
          Manga: "📖 Манга",
          Blacklist: "🚫 Чёрный список"
        },
        buttons: {
          backHome: "← Назад",
          addNew: "+ Добавить",
          addPrimary: "Добавить",
          addFolder: "+ Папка",
          addToFolder: "Добавить в папку",
          moreActions: "Ещё действия",
          backShelf: "← Назад к полке",
          close: "Закрыть",
          changeStatus: "Изменить статус",
          open: "Открыть",
          add: "Добавить",
          cancel: "Отмена",
          manualAdd: "Добавить вручную",
          save: "Сохранить",
          delete: "Удалить",
          moveToBlacklist: "Перенести в чёрный список"
        },
        modals: {
          searchTitle: "Поиск и добавление",
          searchSubtitle: "Поиск идёт по API выбранной категории. Запрос пробуется на русском и английском.",
          searchPlaceholder: "Введите название или автора",
          statusTitle: "Выберите статус",
          manualTitle: "Добавить вручную",
          manualSubtitle: "Используйте это, если поиск не нашёл нужное произведение."
        },
        labels: {
          cover: "Обложка",
          description: "Описание",
          noResults: "Ничего не найдено",
          alreadyExists: "Это произведение уже есть на полке.",
          itemNotFound: "Произведение не найдено на полке.",
          statusLabel: "Статус",
          searching: "Поиск...",
          noBooksFound: "Ничего не найдено",
          apiError: "Ошибка API",
          dbSaveError: "Ошибка сохранения в базу данных",
          dbUpdateError: "Ошибка обновления Supabase",
          dbStatusNotSaved: "Статус не был сохранён в базу",
          name: "Название",
          creator: "Автор / Режиссёр / Студия",
          coverUrl: "Ссылка на обложку",
          descriptionPlaceholder: "Описание",
          manualNameRequired: "Название обязательно",
          noDescription: "Описание отсутствует.",
          canonicalKey: "Canonical Key",
          canonicalSaved: "Canonical key saved",
          canonicalSaveError: "Ошибка сохранения canonical key",
          mustBeLoggedIn: "Нужно войти в аккаунт",
          setUsernameFirst: "Сначала задайте username",
          libraryLinkCopied: "Ссылка на библиотеку скопирована:",
          userCreatedCheckEmail: "Пользователь создан. Проверьте почту.",
          profileLookupError: "Ошибка поиска профиля",
          userNotFound: "Пользователь не найден",
          libraryPrivate: "Библиотека закрыта",
          unknownStatus: "Неизвестно",
          confirmDelete: "Удалить это произведение?",
          deleteError: "Не удалось удалить произведение",
          confirmMoveToBlacklist: "Перенести это произведение в чёрный список?",
          moveError: "Не удалось перенести произведение",
          filterByStatus: "Фильтр по статусу",
          filterByFolder: "Фильтр по папке",
          allStatuses: "Все статусы",
          allFolders: "Все папки",
          folder: "Папка",
          noFolder: "Без папки",
          saveFolder: "Сохранить папку",
          folderSaved: "Папка сохранена",
          relatedWorks: "Связанные произведения",
          relatedWorksEmpty: "Связанные произведения пока не найдены.",
          runtimeError: "Ошибка приложения. Обновите страницу. Детали:"
        },
        statuses: {
          All: "Все статусы",
          Planned: "Запланировано",
          "In progress": "В процессе",
          Done: "Завершено",
          Dropped: "Брошено",
          Info: "Инфо"
        },
        categoryNames: {
          Books: "Книги",
          Movies: "Фильмы",
          Series: "Сериалы",
          Anime: "Аниме",
          Manga: "Манга",
          Blacklist: "Чёрный список"
        },
        home: {
          heroBadge: "Ваша личная вселенная",
          libraryTitle: "Библиотека",
          libraryNote: "Выберите категорию",
          quickAddTitle: "Быстрое добавление",
          quickAddNote: "Выберите категорию и сразу перейдите к добавлению."
        },
        brand: {
          subtitle: "Трекер медиа"
        }
      }
    };

    Object.assign(translations.en, {
      share: {
        modalTitle: "Share library",
        modalSubtitle: "Create a public NFC business card that opens your profile and read-only library.",
        publicAccess: "Public access enabled",
        cardTitle: "Card title",
        shortBio: "Short bio",
        libraryMode: "Library mode",
        previewMode: "Preview",
        fullMode: "Full library",
        publicLink: "Public link",
        nfcLink: "NFC link",
        copyLink: "Copy link",
        showQr: "Show QR",
        hideQr: "Hide QR",
        writeNfc: "Write to NFC",
        rewriteNfc: "Rewrite NFC",
        regenerateToken: "Regenerate token",
        openPublicCard: "Open public card",
        saveSettings: "Save sharing settings",
        publicLibraryTitle: "Public library / NFC business card",
        publicLibraryHint: "A public read-only library page you can open from NFC, QR, or a direct profile link.",
        ownerControlsTitle: "Manage NFC business card",
        ownerControlsHint: "This NFC flow opens your public profile. If you ever need an access key, validate a server-issued token instead of trusting a URL alone.",
        ownerNote: "This is your own NFC business card. Visitors can only browse it in read-only mode.",
        previewTitle: "Library preview",
        previewHint: "A read-only preview from this public library.",
        openLibrary: "Open library",
        saveToMine: "Save to my library",
        saveToMineDone: "Saved",
        savedToMine: "Library saved to your collection.",
        loginToSave: "Log in to save this library to your collection.",
        alreadySaved: "This library is already saved.",
        ownLibrary: "This is your own library.",
        unavailable: "This public card is unavailable.",
        private: "Public access is disabled for this card.",
        noItems: "No public items yet.",
        noPreview: "No items are available for the public preview yet.",
        tokenRegenerated: "New public token generated.",
        settingsSaved: "Sharing settings saved.",
        nfcNotSupported: "Web NFC is not available in this browser. Use the link, QR code or iPhone instructions instead.",
        nfcReady: "Web NFC is available in this browser.",
        nfcPrompt: "Hold your NFC tag near the device to write the public Plamut profile link.",
        nfcSuccess: "Public Plamut profile link written to the NFC tag.",
        nfcError: "Could not write the NFC tag",
        iphoneHelp: "How to write NFC on iPhone?",
        close: "Close",
        linkCopied: "Public link copied:",
        savePromptAfterLogin: "After login, return here and tap Save to mine again.",
        qrAlt: "QR code for public Plamut business card",
        back: "← Back",
        ownerOnlyAction: "Only the owner can manage this NFC business card."
      }
    });

    Object.assign(translations.ru, {
      share: {
        modalTitle: "Поделиться библиотекой",
        modalSubtitle: "Создайте публичную NFC-визитку, которая открывает профиль и библиотеку только для чтения.",
        publicAccess: "Публичный доступ включён",
        cardTitle: "Заголовок карточки",
        shortBio: "Короткое описание",
        libraryMode: "Режим библиотеки",
        previewMode: "Превью",
        fullMode: "Полная библиотека",
        publicLink: "Публичная ссылка",
        nfcLink: "NFC-ссылка",
        copyLink: "Скопировать ссылку",
        showQr: "Показать QR",
        hideQr: "Скрыть QR",
        writeNfc: "Записать на NFC",
        rewriteNfc: "Перезаписать NFC",
        regenerateToken: "Регенерировать токен",
        openPublicCard: "Открыть публичную карточку",
        saveSettings: "Сохранить настройки шаринга",
        publicLibraryTitle: "Публичная библиотека / NFC-визитка",
        publicLibraryHint: "Публичная read-only страница библиотеки, которую можно открыть через NFC, QR или прямую ссылку на профиль.",
        ownerControlsTitle: "Управление NFC-визиткой",
        ownerControlsHint: "Эта NFC-визитка открывает ваш публичный профиль. Если позже понадобится режим access key, его нужно делать через серверную проверку токена, а не доверять одному URL.",
        ownerNote: "Это ваша собственная NFC-визитка. Для посетителей она доступна только в режиме просмотра.",
        previewTitle: "Превью библиотеки",
        previewHint: "Read-only превью этой публичной библиотеки.",
        openLibrary: "Открыть библиотеку",
        saveToMine: "Сохранить в мою библиотеку",
        saveToMineDone: "Сохранено",
        savedToMine: "Библиотека сохранена в вашу коллекцию.",
        loginToSave: "Войдите, чтобы сохранить эту библиотеку к себе.",
        alreadySaved: "Эта библиотека уже сохранена.",
        ownLibrary: "Это ваша собственная библиотека.",
        unavailable: "Эта публичная карточка недоступна.",
        private: "Публичный доступ к этой карточке выключен.",
        noItems: "Публичных материалов пока нет.",
        noPreview: "Пока нет элементов для публичного превью.",
        tokenRegenerated: "Создан новый публичный токен.",
        settingsSaved: "Настройки шаринга сохранены.",
        nfcNotSupported: "Web NFC недоступен в этом браузере. Используйте ссылку, QR-код или инструкцию для iPhone.",
        nfcReady: "Web NFC доступен в этом браузере.",
        nfcPrompt: "Поднесите NFC-метку к устройству, чтобы записать публичную ссылку на профиль Plamut.",
        nfcSuccess: "Публичная ссылка на профиль Plamut записана на NFC-метку.",
        nfcError: "Не удалось записать NFC-метку",
        iphoneHelp: "Как записать NFC на iPhone?",
        close: "Закрыть",
        linkCopied: "Публичная ссылка скопирована:",
        savePromptAfterLogin: "После входа вернитесь сюда и снова нажмите «Сохранить к себе».",
        qrAlt: "QR-код публичной NFC-визитки Plamut",
        back: "← Назад",
        ownerOnlyAction: "Управлять этой NFC-визиткой может только владелец."
      }
    });

    Object.assign(translations.en.share, {
      sharedLibrary: "Shared library",
      libraryHint: "Open the read-only library to browse saved items.",
      loading: "Loading public card…",
      emptyLibrary: "This public library is empty.",
      emptyLibraryHint: "Come back later — the owner may add books, movies or series.",
      notFound: "This public card is unavailable.",
      notFoundHint: "Please check the link and try again.",
      guestBadge: "Public library",
      ownerBadge: "NFC business card",
      libraryCategories: "Categories",
      libraryFolders: "Folders",
      libraryStatuses: "Statuses",
      fastEntry: "NFC quick entry",
      originalTitle: "Original title",
      rating: "Rating",
      year: "Year",
      type: "Type"
    });

    Object.assign(translations.ru.share, {
      sharedLibrary: "Публичная библиотека",
      libraryHint: "Откройте библиотеку, чтобы посмотреть материалы в режиме только чтения.",
      loading: "Загрузка публичной визитки…",
      emptyLibrary: "В этой библиотеке пока нет публичных материалов.",
      emptyLibraryHint: "Вернитесь позже — владелец может добавить новые книги, фильмы или сериалы.",
      notFound: "Эта публичная визитка недоступна.",
      notFoundHint: "Проверьте ссылку и попробуйте ещё раз.",
      guestBadge: "Публичная библиотека",
      ownerBadge: "NFC-визитка",
      libraryCategories: "Категории",
      libraryFolders: "Папки",
      libraryStatuses: "Статусы",
      fastEntry: "Быстрый вход по NFC",
      originalTitle: "Оригинальное название",
      rating: "Рейтинг",
      year: "Год",
      type: "Тип"
    });

    let currentLanguage = localStorage.getItem("plamut_language") || "ru";
    let currentThemeMode = localStorage.getItem("plamut_theme_mode") || "system";
    let currentCategory = null;
    let currentOpenItemId = null;
    let currentStatusItemId = null;
    let currentSearchResults = [];
    let isPublicView = false;
    let currentPublicProfileName = "Library";
    let searchTimer = null;
    let currentFilterStatus = localStorage.getItem("plamut_status_filter") || "All";
    let currentShelfSearchQuery = "";
    let currentFolderModalItemId = null;
    let pendingFolderSelection = "";
    let currentOpenMenuItemId = null;
    let currentProfileData = null;
    let currentPublicProfile = null;
    let activeShareToken = "";
    let currentPublicShareItems = [];
    let currentPublicShareState = "loading";
    let publicLibraryExpanded = false;
    let currentNfcContext = null;
    let currentPublicLibraryMeta = { categories: [], folders: [], statuses: [] };
    let currentSavedLibraryState = { saved: false, source: "none" };
    const relationCache = new Map();
    let relatedLibraryItemsCache = { userId: "", items: [], loaded: false, promise: null };

    const demoData = {
      Books: [],
      Movies: [],
      Series: [],
      Anime: [],
      Manga: [],
      Blacklist: []
    };

    const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

    function getLanguageLabel(lang = currentLanguage){
      return String(lang || "ru").toUpperCase();
    }

    function getThemeModeLabel(mode = currentThemeMode){
      if(mode === "light") return t().topbar.themeLight;
      if(mode === "dark") return t().topbar.themeDark;
      return t().topbar.themeSystem;
    }

    function resolveThemeMode(mode = currentThemeMode){
      if(mode === "system"){
        return systemThemeMedia.matches ? "dark" : "light";
      }
      return mode === "light" ? "light" : "dark";
    }

    function invalidateRelatedLibraryItemsCache(userId = relatedLibraryItemsCache.userId){
      relatedLibraryItemsCache = { userId: userId || "", items: [], loaded: false, promise: null };
    }

    function clearRelationCache(){
      relationCache.clear();
      invalidateRelatedLibraryItemsCache(relatedLibraryItemsCache.userId);
    }

    function getRelationCacheKey(item, category = currentCategory){
      if(!item) return "";
      return buildRelationIdentity(item, category || item.category || currentCategory || "");
    }

    function getCachedRelatedItems(item, category = currentCategory){
      const key = getRelationCacheKey(item, category);
      if(!key || !relationCache.has(key)) return null;
      return relationCache.get(key).map((entry) => ({ ...entry }));
    }

    function setCachedRelatedItems(item, category = currentCategory, relatedItems = []){
      const key = getRelationCacheKey(item, category);
      if(!key) return [];
      const snapshot = relatedItems.slice(0, 6).map((entry) => ({ ...entry }));
      relationCache.set(key, snapshot);
      return snapshot.map((entry) => ({ ...entry }));
    }

    function deferRelatedItemsRender(item, category = currentCategory){
      const run = () => renderRelatedItemsSection(item, category).catch((error) => {
        console.error("Related items render error:", error);
      });
      if(typeof window.requestAnimationFrame === "function"){
        window.requestAnimationFrame(() => window.setTimeout(run, 0));
      } else {
        window.setTimeout(run, 0);
      }
    }

    function applyThemeMode(){
      const resolvedTheme = resolveThemeMode();
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
      updatePreferenceControls();
    }

    function setThemeMode(mode){
      currentThemeMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
      localStorage.setItem("plamut_theme_mode", currentThemeMode);
      applyThemeMode();
    }

    function updatePreferenceControls(){
      const preferencesBtn = document.getElementById("preferences-btn");
      const preferencesLabel = document.getElementById("preferences-btn-label");
      const preferencesTitle = document.getElementById("preferences-title");
      const languageTitle = document.getElementById("preferences-language-title");
      const themeTitle = document.getElementById("preferences-theme-title");
      const profileBtn = document.getElementById("profile-btn");

      if(preferencesLabel){
        preferencesLabel.textContent = getLanguageLabel();
      }

      if(preferencesBtn){
        const titleText = `${t().topbar.interface}: ${getLanguageLabel()} · ${getThemeModeLabel()}`;
        preferencesBtn.title = titleText;
        preferencesBtn.setAttribute("aria-label", titleText);
      }

      if(preferencesTitle) preferencesTitle.textContent = t().topbar.interface;
      if(languageTitle) languageTitle.textContent = t().topbar.language;
      if(themeTitle) themeTitle.textContent = t().topbar.theme;

      [["lang-option-ru", "ru"], ["lang-option-en", "en"]].forEach(([id, value]) => {
        const button = document.getElementById(id);
        if(!button) return;
        const isActive = currentLanguage === value;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      [["theme-option-light", "light", t().topbar.themeLight], ["theme-option-dark", "dark", t().topbar.themeDark], ["theme-option-system", "system", t().topbar.themeSystem]].forEach(([id, value, label]) => {
        const button = document.getElementById(id);
        if(!button) return;
        const isActive = currentThemeMode === value;
        button.textContent = label;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      if(profileBtn){
        profileBtn.title = t().topbar.profile;
        profileBtn.setAttribute("aria-label", t().topbar.profile);
      }
    }

    function togglePreferencesPanel(force){
      const panel = document.getElementById("preferences-panel");
      const button = document.getElementById("preferences-btn");
      if(!panel || !button) return;

      const shouldOpen = typeof force === "boolean" ? force : panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !shouldOpen);
      button.setAttribute("aria-expanded", String(shouldOpen));
    }

    function closePreferencesPanel(){
      togglePreferencesPanel(false);
    }

    function getProfileInitials(displayName = "", username = ""){
      const source = normalizeSpaces(displayName || username || "P");
      const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
      const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
      return initials || "P";
    }

    function t() {
      return translations[currentLanguage];
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function normalizeSpaces(text){
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function normalizeComparisonText(text){
      return normalizeSpaces(text)
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeQuery(query){
      const text = normalizeSpaces(query);
      return {
        text,
        comparison: normalizeComparisonText(text),
        isbn: detectISBN(text),
        hasCyrillic: hasCyrillic(text),
        hasLatin: hasLatin(text)
      };
    }

    function detectISBN(value){
      const candidate = String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
      if(candidate.length === 10 && isValidIsbn10(candidate)) return candidate;
      if(candidate.length === 13 && isValidIsbn13(candidate)) return candidate;
      return "";
    }

    function isValidIsbn10(value){
      if(!/^\d{9}[\dX]$/.test(value)) return false;
      const sum = value.split("").reduce((acc, char, index) => {
        const digit = char === "X" ? 10 : Number(char);
        return acc + digit * (10 - index);
      }, 0);
      return sum % 11 === 0;
    }

    function isValidIsbn13(value){
      if(!/^\d{13}$/.test(value)) return false;
      const sum = value
        .slice(0, 12)
        .split("")
        .reduce((acc, char, index) => acc + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
      const checksum = (10 - (sum % 10)) % 10;
      return checksum === Number(value[12]);
    }

    function isOwnerControlAllowed(){
      if(!isPublicView) return true;
      alert(t().share.ownerOnlyAction);
      return false;
    }

    function isShareEnabled(profile = {}){
      if(typeof profile.public_share_enabled === "boolean"){
        return profile.public_share_enabled;
      }
      if(typeof profile.is_public === "boolean"){
        return profile.is_public;
      }
      return true;
    }

    function getShareCardTitle(profile = {}){
      return normalizeSpaces(profile.public_card_title || profile.display_name || profile.username || "Plamut");
    }

    function getShareCardBio(profile = {}){
      return normalizeSpaces(profile.public_card_bio || "");
    }

    function getShareLibraryMode(profile = {}){
      const mode = String(profile.public_library_mode || "preview").toLowerCase();
      return mode === "full" ? "full" : "preview";
    }

    function generateToken(length = 24){
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    }

    function buildPublicShareUrl(token){
      return `${window.location.origin}/nfc/${encodeURIComponent(token || "")}`;
    }

    function isNfcRoute(){
      return window.location.pathname.startsWith("/nfc/");
    }

    function supportsTable(error, tableName){
      return !error || !new RegExp(`relation .*${tableName}`, "i").test(String(error.message || ""));
    }

    function buildQrImageUrl(url){
      return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url || "")}`;
    }

    function browserSupportsWebNfc(){
      return typeof window.NDEFWriter !== "undefined" || typeof window.NDEFReader !== "undefined";
    }

    function isLikelyIphone(){
      const ua = navigator.userAgent || "";
      return /iPhone|iPad|iPod/i.test(ua);
    }

    function populateShareQr(containerId, imageId, url){
      const box = document.getElementById(containerId);
      const img = document.getElementById(imageId);
      if(!box || !img || !url){
        return;
      }
      img.src = buildQrImageUrl(url);
      img.alt = t().share.qrAlt;
    }

    function setValueIfPresent(id, value){
      const element = document.getElementById(id);
      if(element){
        element.value = value;
      }
    }

    function setCheckedIfPresent(id, value){
      const element = document.getElementById(id);
      if(element){
        element.checked = Boolean(value);
      }
    }

    function setTextIfPresent(id, value){
      const element = document.getElementById(id);
      if(element){
        element.textContent = value;
      }
    }

    function ensurePublicProfileCollectionsReset(){
      demoData.Books = [];
      demoData.Movies = [];
      demoData.Series = [];
      demoData.Anime = [];
      demoData.Manga = [];
      demoData.Blacklist = [];
    }

    function getItemStorageKey(itemOrParts = {}){
      const category = itemOrParts.category || currentCategory || "";
      const canonicalKey = itemOrParts.canonical_key || itemOrParts.canonicalKey || "";
      const workKey = itemOrParts.work_key || itemOrParts.workKey || "";
      const title = normalizeSpaces(itemOrParts.title || "").toLowerCase();
      return [category, canonicalKey || workKey || title].join(":");
    }

    async function getCurrentUserId(){
      const user = await getCurrentUser();
      return user?.id || "guest";
    }

    async function getAccountStorageValue(suffix, fallback){
      const userId = await getCurrentUserId();
      try {
        const raw = localStorage.getItem(`plamut_${suffix}_${userId}`);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_error) {
        return fallback;
      }
    }

    async function setAccountStorageValue(suffix, value){
      const userId = await getCurrentUserId();
      localStorage.setItem(`plamut_${suffix}_${userId}`, JSON.stringify(value));
    }

    async function getCustomStatuses(){
      return await getAccountStorageValue("custom_statuses", []);
    }

    async function setCustomStatuses(statuses){
      await setAccountStorageValue("custom_statuses", statuses);
    }

    async function getCustomFolders(){
      return await getAccountStorageValue("custom_folders", []);
    }

    async function setCustomFolders(folders){
      await setAccountStorageValue("custom_folders", folders);
    }

    async function getFolderAssignments(){
      return await getAccountStorageValue("folder_assignments", {});
    }

    async function setFolderAssignments(assignments){
      await setAccountStorageValue("folder_assignments", assignments);
    }

    async function getAvailableStatuses(){
      const customStatuses = await getCustomStatuses();
      const dynamicStatuses = Object.values(demoData)
        .flat()
        .map((item) => normalizeSpaces(item?.status || ""))
        .filter(Boolean);
      return Array.from(new Set(["Planned", "In progress", "Done", "Dropped", ...customStatuses, ...dynamicStatuses]));
    }

    async function getAvailableFolders(){
      const customFolders = await getCustomFolders();
      const dynamicFolders = Object.values(demoData)
        .flat()
        .map((item) => normalizeSpaces(item?.folder || ""))
        .filter(Boolean);
      return Array.from(new Set([...customFolders, ...dynamicFolders]));
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      localStorage.setItem("plamut_language", lang);
      document.documentElement.lang = lang;
      applyTranslations();
      updatePreferenceControls();
      rerenderCurrentScreen();
      closePreferencesPanel();
    }

    function setStatusFilter(value){
      currentFilterStatus = value || "All";
      localStorage.setItem("plamut_status_filter", currentFilterStatus);
      renderShelf();
    }

    function setShelfSearchQuery(value){
      currentShelfSearchQuery = normalizeSpaces(value);
      renderShelf();
    }

    function syncShelfSearchInput(){
      const input = document.getElementById("shelf-search-input");
      if(input){
        input.value = currentShelfSearchQuery;
      }
    }

    function resetShelfSearchQuery(){
      currentShelfSearchQuery = "";
      syncShelfSearchInput();
    }

    function updateHeaderCompactState(){
      document.body.classList.toggle("header-compact", window.scrollY > 18);
    }

    async function renderStatusOptions(){
      const container = document.getElementById("status-buttons");
      if(!container) return;

      const statuses = await getAvailableStatuses();
      container.innerHTML = "";

      statuses.forEach((status) => {
        const button = document.createElement("button");
        button.className = "button";
        button.type = "button";
        button.textContent = translateStatus(status);
        button.addEventListener("click", () => {
          setStatus(status);
        });
        container.appendChild(button);
      });
    }

    async function renderFolderFilterOptions(){
      return await getAvailableFolders();
    }

    async function renderCustomCollections(){
      return;
    }

    function refreshAccountCollectionsUI(){
      renderStatusOptions();
      renderFolderFilterOptions();
      renderCustomCollections();
    }

    function applyTranslations() {
      document.documentElement.lang = currentLanguage;

      document.getElementById("home-subtitle").textContent = t().subtitle;
      document.getElementById("hero-badge").textContent = t().home.heroBadge;
      document.getElementById("library-section-title").textContent = t().home.libraryTitle;
      document.getElementById("library-section-note").textContent = t().home.libraryNote;
      document.getElementById("home-add-btn").textContent = t().buttons.addPrimary;
      document.getElementById("home-add-panel-title").textContent = t().home.quickAddTitle;
      document.getElementById("home-add-panel-note").textContent = t().home.quickAddNote;
      document.getElementById("brand-subtitle").textContent = t().brand.subtitle;

      document.getElementById("cat-books").textContent = t().categories.Books;
      document.getElementById("cat-movies").textContent = t().categories.Movies;
      document.getElementById("cat-series").textContent = t().categories.Series;
      document.getElementById("cat-anime").textContent = t().categories.Anime;
      document.getElementById("cat-manga").textContent = t().categories.Manga;
      document.getElementById("cat-blacklist").textContent = t().categories.Blacklist;
      document.getElementById("quick-add-books").textContent = t().categories.Books;
      document.getElementById("quick-add-movies").textContent = t().categories.Movies;
      document.getElementById("quick-add-series").textContent = t().categories.Series;
      document.getElementById("quick-add-anime").textContent = t().categories.Anime;
      document.getElementById("quick-add-manga").textContent = t().categories.Manga;

      document.getElementById("public-tab-books").textContent = t().categoryNames.Books;
      document.getElementById("public-tab-movies").textContent = t().categoryNames.Movies;
      document.getElementById("public-tab-series").textContent = t().categoryNames.Series;
      document.getElementById("public-tab-anime").textContent = t().categoryNames.Anime;
      document.getElementById("public-tab-manga").textContent = t().categoryNames.Manga;
      document.getElementById("public-tab-blacklist").textContent = t().categoryNames.Blacklist;

      document.getElementById("back-home-btn").textContent = t().buttons.backHome;
      document.getElementById("add-new-btn").textContent = t().buttons.addNew;
      document.getElementById("add-folder-btn").textContent = t().buttons.addFolder;
      document.getElementById("back-shelf-btn").textContent = t().buttons.backShelf;
      document.getElementById("description-label").textContent = t().labels.description;
      document.getElementById("change-status-details-btn").textContent = t().buttons.changeStatus;
      document.getElementById("delete-details-btn").textContent = t().buttons.delete;

      document.getElementById("search-modal-title").textContent = t().modals.searchTitle;
      document.getElementById("search-modal-subtitle").textContent = t().modals.searchSubtitle;
      document.getElementById("search-input").placeholder = t().modals.searchPlaceholder;
      document.getElementById("shelf-search-input").placeholder = t().modals.searchPlaceholder;
      document.getElementById("close-search-btn").textContent = t().buttons.close;
      document.getElementById("manual-add-btn").textContent = t().buttons.manualAdd;

      document.getElementById("manual-title").textContent = t().modals.manualTitle;
      document.getElementById("manual-subtitle").textContent = t().modals.manualSubtitle;
      document.getElementById("manual-name").placeholder = t().labels.name;
      document.getElementById("manual-creator").placeholder = t().labels.creator;
      document.getElementById("manual-cover").placeholder = t().labels.coverUrl;
      document.getElementById("manual-description").placeholder = t().labels.descriptionPlaceholder;
      document.getElementById("manual-cancel-btn").textContent = t().buttons.cancel;
      document.getElementById("manual-save-btn").textContent = t().buttons.save;

      document.getElementById("status-modal-title").textContent = t().modals.statusTitle;
      document.getElementById("status-custom-label").textContent = t().profile.customStatusLabel;
      document.getElementById("custom-status-input").placeholder = t().profile.customStatusLabel;
      document.getElementById("status-add-custom-btn").textContent = t().profile.addStatus;
      document.getElementById("status-blacklist").textContent = t().buttons.moveToBlacklist;
      document.getElementById("status-cancel").textContent = t().buttons.cancel;

      document.getElementById("canonical-key-section").querySelector("h3").textContent = t().labels.canonicalKey;
      document.querySelector("#canonical-key-section .button").textContent = t().buttons.save;
      document.getElementById("details-folder-title").textContent = t().labels.folder;
      document.getElementById("open-folder-modal-btn").textContent = t().buttons.addToFolder;
      document.getElementById("details-folder-current").textContent = t().labels.noFolder;
      document.getElementById("details-relations-title").textContent = t().labels.relatedWorks;
      document.getElementById("details-relations-empty").textContent = t().labels.relatedWorksEmpty;
      document.getElementById("folder-modal-title").textContent = t().buttons.addToFolder;
      document.getElementById("folder-modal-subtitle").textContent = t().labels.folder;
      document.getElementById("folder-modal-cancel-btn").textContent = t().buttons.cancel;
      document.getElementById("folder-modal-save-btn").textContent = t().labels.saveFolder;

      document.getElementById("profile-title").textContent = t().profile.title;
      document.getElementById("profile-subtitle").textContent = t().profile.subtitle;
      document.getElementById("profile-avatar-title").textContent = t().profile.avatarTitle;
      document.getElementById("profile-avatar-hint").textContent = t().profile.avatarHint;
      document.getElementById("profile-account-title").textContent = t().profile.accountTitle;
      document.getElementById("profile-username-label").textContent = t().profile.usernameLabel;
      document.getElementById("profile-username").placeholder = t().profile.username;
      document.getElementById("profile-display-name-label").textContent = t().profile.displayNameLabel;
      document.getElementById("profile-display-name").placeholder = t().profile.displayName;
      document.getElementById("profile-privacy-title").textContent = t().profile.privacyTitle;
      document.getElementById("profile-privacy-hint").textContent = t().profile.privacyHint;
      document.getElementById("profile-public-label").textContent = t().profile.publicLibrary;
      document.getElementById("profile-security-title").textContent = t().profile.securityTitle;
      document.getElementById("profile-security-hint").textContent = t().profile.securityHint;
      document.getElementById("profile-new-password-label").textContent = t().profile.newPassword;
      document.getElementById("new-password").placeholder = t().profile.newPassword;
      document.getElementById("profile-confirm-password-label").textContent = t().profile.confirmPassword;
      document.getElementById("confirm-password").placeholder = t().profile.confirmPassword;
      document.getElementById("profile-show-password-label").textContent = t().profile.showPassword;
      document.getElementById("profile-change-password-btn").textContent = t().profile.changePassword;
      document.getElementById("profile-upload-avatar-btn").textContent = t().profile.uploadAvatar;
      document.getElementById("profile-remove-avatar-btn").textContent = t().profile.removeAvatar;
      document.getElementById("profile-logout-btn").textContent = t().profile.logout;
      document.getElementById("profile-close-btn").textContent = t().profile.close;
      document.getElementById("profile-save-btn").textContent = t().profile.save;

      document.getElementById("login-top-btn").textContent = t().topbar.login;
      document.getElementById("share-library-btn").textContent = t().topbar.shareLibrary;
      document.getElementById("auth-text").textContent = t().auth.text;

      setTextIfPresent("share-modal-title", t().share.modalTitle);
      setTextIfPresent("share-modal-subtitle", t().share.modalSubtitle);
      setTextIfPresent("share-modal-public-enabled-label", t().share.publicAccess);
      setTextIfPresent("share-modal-card-title-label", t().share.cardTitle);
      setTextIfPresent("share-modal-card-bio-label", t().share.shortBio);
      setTextIfPresent("share-modal-library-mode-label", t().share.libraryMode);
      setTextIfPresent("share-modal-library-mode-preview", t().share.previewMode);
      setTextIfPresent("share-modal-library-mode-full", t().share.fullMode);
      setTextIfPresent("share-modal-link-label", t().share.nfcLink);
      setTextIfPresent("share-modal-copy-btn", t().share.copyLink);
      setTextIfPresent("share-modal-qr-btn", t().share.showQr);
      setTextIfPresent("share-modal-write-nfc-btn", t().share.writeNfc);
      setTextIfPresent("share-modal-iphone-help-summary", t().share.iphoneHelp);
      setTextIfPresent("share-modal-open-btn", t().share.openPublicCard);
      setTextIfPresent("share-modal-regenerate-btn", t().share.regenerateToken);
      setTextIfPresent("share-modal-close-btn", t().share.close);
      setTextIfPresent("share-modal-save-btn", t().share.saveSettings);
      setTextIfPresent("public-share-back-btn", t().share.back);
      setTextIfPresent("public-share-link-label", t().share.nfcLink);
      setTextIfPresent("public-share-open-library-btn", t().share.openLibrary);
      setTextIfPresent("public-share-save-btn", currentSavedLibraryState.saved ? t().share.saveToMineDone : t().share.saveToMine);
      setTextIfPresent("public-share-owner-controls-title", t().share.ownerControlsTitle);
      setTextIfPresent("public-share-owner-controls-hint", t().share.ownerControlsHint);
      setTextIfPresent("share-public-enabled-label", t().share.publicAccess);
      setTextIfPresent("share-card-title-label", t().share.cardTitle);
      setTextIfPresent("share-card-bio-label", t().share.shortBio);
      setTextIfPresent("share-library-mode-label", t().share.libraryMode);
      setTextIfPresent("share-library-mode-preview", t().share.previewMode);
      setTextIfPresent("share-library-mode-full", t().share.fullMode);
      setTextIfPresent("owner-copy-link-btn", t().share.copyLink);
      setTextIfPresent("owner-show-qr-btn", t().share.showQr);
      setTextIfPresent("owner-write-nfc-btn", t().share.writeNfc);
      setTextIfPresent("owner-regenerate-token-btn", t().share.regenerateToken);
      setTextIfPresent("iphone-help-summary", t().share.iphoneHelp);
      setTextIfPresent("share-save-settings-btn", t().share.saveSettings);
      setTextIfPresent("public-preview-title", t().share.sharedLibrary);
      setTextIfPresent("public-preview-hint", t().share.libraryHint);
      setTextIfPresent("public-share-loading-text", t().share.loading);
      setTextIfPresent("public-share-error-title", t().share.notFound);
      setTextIfPresent("public-share-error-text", t().share.notFoundHint);
      setTextIfPresent("public-share-empty-title", t().share.emptyLibrary);
      setTextIfPresent("public-share-empty-text", t().share.emptyLibraryHint);

      const publicCopyBtn = document.getElementById("public-share-copy-btn");
      if(publicCopyBtn){
        publicCopyBtn.setAttribute("title", t().share.copyLink);
        publicCopyBtn.setAttribute("aria-label", t().share.copyLink);
      }

      const publicQrBtn = document.getElementById("public-share-qr-btn");
      if(publicQrBtn){
        publicQrBtn.setAttribute("title", t().share.showQr);
        publicQrBtn.setAttribute("aria-label", t().share.showQr);
      }

      const iphoneSteps = currentLanguage === "ru"
        ? [
            "Скопируйте свою публичную ссылку Plamut.",
            "Установите приложение для записи NFC-меток, например NFC Tools.",
            "Откройте приложение.",
            "Выберите запись URL/ссылки.",
            "Вставьте свою публичную ссылку Plamut.",
            "Поднесите NFC-метку к iPhone и запишите данные.",
            "После записи проверьте метку, приложив её к телефону."
          ]
        : [
            "Copy your public Plamut link.",
            "Install an NFC writing app such as NFC Tools.",
            "Open the app.",
            "Choose writing a URL/link record.",
            "Paste your public Plamut link.",
            "Hold the NFC tag near your iPhone and write the data.",
            "Test the tag by tapping it with your phone."
          ];

      ["iphone-help-steps", "share-modal-iphone-help-steps"].forEach((id) => {
        const list = document.getElementById(id);
        if(list){
          list.innerHTML = iphoneSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
        }
      });

      document.querySelector("#auth-screen h2").textContent = t().auth.loginTitle;
      document.getElementById("login-email").placeholder = t().auth.email;
      document.getElementById("login-password").placeholder = t().auth.password;
      document.querySelector('#auth-screen button[onclick="login()"]').textContent = t().auth.login;
      document.querySelector('#auth-screen button[onclick="register()"]').textContent = t().auth.register;

      document.getElementById("status-filter-label").textContent = t().labels.filterByStatus;
      const filterSelect = document.getElementById("status-filter");
      if(filterSelect){
        getAvailableStatuses().then((statuses) => {
          filterSelect.innerHTML = `
            <option value="All">${escapeHtml(t().labels.allStatuses)}</option>
            ${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(translateStatus(status))}</option>`).join("")}
          `;
          filterSelect.value = statuses.includes(currentFilterStatus) || currentFilterStatus === "All"
            ? currentFilterStatus
            : "All";
        });
      }

      refreshAccountCollectionsUI();
      updatePreferenceControls();
    }

    function rerenderCurrentScreen() {
      if (!document.getElementById("category-screen").classList.contains("hidden") && currentCategory) {
        if (isPublicView) {
          document.getElementById("category-title").textContent =
            currentPublicProfileName + " — " + translateCategory(currentCategory);
        } else {
          document.getElementById("category-title").textContent = translateCategory(currentCategory);
        }
        renderShelf();
      }

      if(!document.getElementById("public-share-screen").classList.contains("hidden") && currentPublicProfile){
        renderPublicShareProfile(currentPublicProfile);
      }

      if (!document.getElementById("details-screen").classList.contains("hidden") && currentOpenItemId) {
        const item = getItemById(currentCategory, currentOpenItemId);
        if(item) openCardById(currentOpenItemId);
      }
    }

    function translateStatus(status) {
      return t().statuses[status] || status;
    }

    function translateCategory(category) {
      return t().categoryNames[category] || category;
    }

    function getItemFolder(item){
      return item?.folder || "";
    }

    function hideAllScreens(){
      document.getElementById("home-screen").classList.add("hidden");
      document.getElementById("library-screen")?.classList.add("hidden");
      document.getElementById("category-screen").classList.add("hidden");
      document.getElementById("details-screen").classList.add("hidden");
      document.getElementById("auth-screen").classList.add("hidden");
      document.getElementById("public-share-screen")?.classList.add("hidden");
      closeFolderModal();
    }

    function isPublicShareRoute(){
      return window.location.pathname.startsWith("/share/") || window.location.pathname.startsWith("/nfc/");
    }

    function setPublicRouteMode(active){
      document.body.classList.toggle("public-route-active", Boolean(active));
      const appShell = document.getElementById("app-shell");
      if(appShell){
        appShell.classList.toggle("public-route-shell", Boolean(active));
      }
    }

    function toggleHomeAddPanel(force){
      const panel = document.getElementById("home-add-panel");
      if(!panel) return;
      const shouldOpen = typeof force === "boolean" ? force : panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !shouldOpen);
    }

    async function startQuickAdd(category){
      if(!category) return;
      toggleHomeAddPanel(false);
      await openCategory(category);
      openAddModal();
    }

    function updatePublicSaveButton(){
      const button = document.getElementById("public-share-save-btn");
      if(!button) return;

      const isOwner = Boolean(currentPublicProfile?.isOwner);
      const isSaved = Boolean(currentSavedLibraryState.saved);
      button.disabled = isOwner || isSaved;
      button.classList.toggle("hidden", isOwner);
      button.textContent = isSaved ? t().share.saveToMineDone : t().share.saveToMine;
    }

    function renderPublicLibraryMeta(){
      const container = document.getElementById("public-share-library-meta");
      if(!container) return;

      const orderedCategories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
      const categoryValues = orderedCategories.filter((category) => (demoData[category] || []).length).map((category) => translateCategory(category));
      const folderValues = [];
      const statusValues = [];
      const folderSet = new Set();
      const statusSet = new Set();

      orderedCategories.forEach((category) => {
        (demoData[category] || []).forEach((item) => {
          if(item.folder && !folderSet.has(item.folder)){
            folderSet.add(item.folder);
            folderValues.push(item.folder);
          }
          const translatedStatus = translateStatus(item.status || "Planned");
          if(translatedStatus && !statusSet.has(translatedStatus)){
            statusSet.add(translatedStatus);
            statusValues.push(translatedStatus);
          }
        });
      });

      const sections = [
        [t().share.libraryCategories, categoryValues],
        [t().share.libraryFolders, folderValues],
        [t().share.libraryStatuses, statusValues]
      ]
        .filter(([, values]) => Array.isArray(values) && values.length)
        .map(([label, values]) => `
          <div class="public-card-meta-group">
            <div class="public-card-meta-label">${escapeHtml(label)}</div>
            <div class="public-card-meta-values">${values.map((value) => `<span class="public-card-meta-chip">${escapeHtml(value)}</span>`).join("")}</div>
          </div>
        `)
        .join("");

      container.innerHTML = sections;
      container.classList.toggle("hidden", !sections);
    }

    function goHome(){
      closePreferencesPanel();
      resetShelfSearchQuery();
      toggleHomeAddPanel(false);
      if(activeShareToken && currentPublicProfile && !currentPublicProfile.isOwner){
        if(document.body.classList.contains("public-route-active")){
          showPublicShareScreen(currentPublicProfile);
          renderShareState(currentPublicShareItems.length ? "ready" : currentPublicShareState);
        } else {
          showPublicLibraryCategoryView(currentPublicProfile);
        }
        return;
      }
      isPublicView = false;
      hideAllScreens();
      document.getElementById("home-screen").classList.remove("hidden");
    }

    function backToCategory(){
      closePreferencesPanel();
      syncShelfSearchInput();
      hideAllScreens();
      document.getElementById("category-screen").classList.remove("hidden");
    }

    function openAddModal(){
      if(!isOwnerControlAllowed()) return;
      closePreferencesPanel();
      document.getElementById("add-modal").classList.remove("hidden");
      document.getElementById("search-input").value = "";
      document.getElementById("search-results").innerHTML = "";
      currentSearchResults = [];
      document.getElementById("search-input").focus();
    }

    function closeAddModal(){
      document.getElementById("add-modal").classList.add("hidden");
    }

    function openManualModal(){
      if(!isOwnerControlAllowed()) return;
      document.getElementById("manual-modal").classList.remove("hidden");
      document.getElementById("manual-name").value = document.getElementById("search-input").value.trim();
      document.getElementById("manual-creator").value = "";
      document.getElementById("manual-cover").value = "";
      document.getElementById("manual-description").value = "";
      document.getElementById("manual-name").focus();
    }

    function closeManualModal(){
      document.getElementById("manual-modal").classList.add("hidden");
    }

    function resetProfileSecurityFields(){
      const newPassword = document.getElementById("new-password");
      const confirmPassword = document.getElementById("confirm-password");
      const showPassword = document.getElementById("profile-show-password");

      if(newPassword) newPassword.value = "";
      if(confirmPassword) confirmPassword.value = "";
      if(showPassword) showPassword.checked = false;

      if(newPassword) newPassword.type = "password";
      if(confirmPassword) confirmPassword.type = "password";
    }

    function safeLoadProfile(context = "profile"){
      return loadProfile().catch((error) => {
        console.error(`Profile load error (${context}):`, error);
      });
    }

    function openProfileModal(){
      const modal = document.getElementById("profile-modal");

      closePreferencesPanel();
      resetProfileSecurityFields();

      if(modal) modal.classList.remove("hidden");

      refreshAccountCollectionsUI();
      safeLoadProfile("openProfileModal");
    }

    function closeProfileModal(){
      document.getElementById("profile-modal").classList.add("hidden");
    }

    async function addCustomStatus(){
      const input = document.getElementById("custom-status-input");
      const value = normalizeSpaces(input?.value);
      if(!value){
        alert(t().profile.customValueRequired);
        return;
      }

      const statuses = await getCustomStatuses();
      if(statuses.includes(value) || ["Planned", "In progress", "Done", "Dropped"].includes(value)){
        alert(t().profile.customStatusExists);
        return;
      }

      statuses.push(value);
      await setCustomStatuses(statuses);
      if(input) input.value = "";
      applyTranslations();
      alert(t().profile.customStatusAdded);
    }

    async function removeCustomStatus(status){
      const statuses = await getCustomStatuses();
      const nextStatuses = statuses.filter((item) => item !== status);
      await setCustomStatuses(nextStatuses);

      if(currentFilterStatus === status){
        currentFilterStatus = "All";
        localStorage.setItem("plamut_status_filter", currentFilterStatus);
      }

      for (const category of Object.keys(demoData)){
        demoData[category].forEach((item) => {
          if(item.status === status){
            item.status = "Planned";
          }
        });
      }

      applyTranslations();
      renderShelf();
      alert(`${status}: ${t().profile.customRemoved}`);
    }

    async function addCustomFolder(){
      if(!isOwnerControlAllowed()) return;
      const value = normalizeSpaces(prompt(t().profile.customFolderLabel, ""));
      if(!value){
        return;
      }

      const folders = await getCustomFolders();
      if(folders.includes(value)){
        alert(t().profile.customFolderExists);
        return;
      }

      folders.push(value);
      await setCustomFolders(folders);
      renderFolderFilterOptions();
      alert(t().profile.customFolderAdded);
    }

    async function removeCustomFolder(folder){
      const folders = await getCustomFolders();
      await setCustomFolders(folders.filter((item) => item !== folder));

      const assignments = await getFolderAssignments();
      Object.keys(assignments).forEach((key) => {
        if(assignments[key] === folder){
          assignments[key] = "";
        }
      });
      await setFolderAssignments(assignments);

      for (const category of Object.keys(demoData)){
        demoData[category].forEach((item) => {
          if(item.folder === folder){
            item.folder = "";
          }
        });
      }

      renderFolderFilterOptions();
      renderShelf();
      alert(`${folder}: ${t().profile.customRemoved}`);
    }

    function showAuthScreen(){
      closePreferencesPanel();
      hideAllScreens();
      document.getElementById("auth-screen").classList.remove("hidden");
    }

    function closeStatusModal(){
      document.getElementById("status-modal").classList.add("hidden");
    }

    function getFilteredItems(){
      const items = demoData[currentCategory] || [];
      const searchComparison = normalizeComparisonText(currentShelfSearchQuery);
      return items.filter((item) => {
        const statusMatches = currentCategory === "Blacklist" || currentFilterStatus === "All" || item.status === currentFilterStatus;
        const haystack = normalizeComparisonText([item.title, item.creator, item.description_ru, item.description_original, item.description_en].filter(Boolean).join(" "));
        const searchMatches = !searchComparison || haystack.includes(searchComparison);
        return statusMatches && searchMatches;
      });
    }

    function getItemById(category, id){
      return (demoData[category] || []).find(item => item.id === id) || null;
    }

    function hasCyrillic(text){
      return /[А-Яа-яЁё]/.test(text || "");
    }

    function hasLatin(text){
      return /[A-Za-z]/.test(text || "");
    }

    async function getCurrentUser(){
      const { data, error } = await supabaseClient.auth.getUser();
      if(error || !data.user) return null;
      return data.user;
    }

    async function fetchJson(url, options = undefined){
      const response = await fetch(url, options);
      if(!response.ok){
        throw new Error("HTTP " + response.status);
      }
      return await response.json();
    }

    async function translateText(text, fromLang, toLang){
      if(!text) return "";
      try {
        const url =
          "https://api.mymemory.translated.net/get?q=" +
          encodeURIComponent(text) +
          "&langpair=" +
          encodeURIComponent(fromLang + "|" + toLang);

        const data = await fetchJson(url);
        return (data?.responseData?.translatedText || "").trim();
      } catch (error) {
        console.error("Translation error:", error);
        return "";
      }
    }

    async function translateTextToRussian(text){
      if(hasCyrillic(text)) return text;
      return await translateText(text, "en", "ru");
    }

    async function translateTextToEnglish(text){
      if(hasLatin(text)) return text;
      return await translateText(text, "ru", "en");
    }

    async function buildSearchQueries(query){
      const meta = typeof query === "string" ? normalizeQuery(query) : (query || normalizeQuery(""));
      const clean = meta.text || normalizeSpaces(query);
      const list = [];
      if(meta.isbn){
        list.push(meta.isbn);
        return list;
      }
      if(clean) list.push(clean);

      try {
        if(meta.hasCyrillic){
          const en = await translateTextToEnglish(clean);
          if(en && !list.includes(en)) list.push(en);
        } else if(meta.hasLatin){
          const ru = await translateTextToRussian(clean);
          if(ru && !list.includes(ru)) list.push(ru);
        }
      } catch (e) {
        console.error("Search translation error:", e);
      }

      return list;
    }

    function looksLikeRussian(text){
      if(!text) return false;
      const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
      if(letters.length < 10) return false;
      const cyrillic = text.match(/[А-Яа-яЁё]/g) || [];
      return (cyrillic.length / letters.length) >= 0.6;
    }

    function looksLikeEnglish(text){
      if(!text) return false;
      const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
      if(letters.length < 10) return false;
      const latin = text.match(/[A-Za-z]/g) || [];
      return (latin.length / letters.length) >= 0.6;
    }

    function splitDescriptionFields(description){
      return {
        description_ru: looksLikeRussian(description) ? description : "",
        description_en: looksLikeEnglish(description) ? description : "",
        description_original: !looksLikeRussian(description) ? description : ""
      };
    }

    function pickBestDescription(item, lang){
      if(!item) return "";
      if(lang === "ru" && item.description_ru) return item.description_ru;
      if(lang === "en" && item.description_original) return item.description_original;
      if(lang === "en" && item.description_en) return item.description_en;
      return item.description || item.description_ru || item.description_original || item.description_en || "";
    }

    function buildCanonicalKey(category, source, rawId, title){
      if(rawId){
        return `${category}:${source}:${rawId}`;
      }
      return `${category}:${String(title || "").trim().toLowerCase()}`;
    }

    function normalizeRelationKey(value){
      return String(value || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\b(part|volume|vol|season|том|часть|сезон)\s*[\divxlc]+\b/giu, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function extractRelationTitleBase(title){
      const base = String(title || "").split(/[:|—–-]/)[0] || "";
      return normalizeRelationKey(base);
    }

    function extractRelationSourceKey(value){
      const normalized = String(value || "").trim();
      if(!normalized) return "";
      const parts = normalized.split(":").map((entry) => entry.trim()).filter(Boolean);
      if(parts.length >= 3) return normalizeRelationKey(parts.slice(2).join(" "));
      if(parts.length >= 2) return normalizeRelationKey(parts.slice(1).join(" "));
      return normalizeRelationKey(normalized);
    }

    function buildRelationIdentity(item = {}, category = ""){
      return `${category || item.category || ""}:${item.id || item.canonical_key || item.work_key || normalizeRelationKey(item.title || "")}`;
    }

    function buildRelationCandidateSnapshot(item = {}, category = ""){
      const resolvedCategory = category || item.category || currentCategory || "";
      return {
        ...item,
        category: resolvedCategory,
        identity: buildRelationIdentity(item, resolvedCategory),
        canonicalBase: extractRelationSourceKey(item.canonical_key || ""),
        workBase: extractRelationSourceKey(item.work_key || ""),
        titleBase: extractRelationTitleBase(item.title || ""),
        titleKey: normalizeRelationKey(item.title || ""),
        creatorKey: normalizeRelationKey(String(item.creator || "").split(",")[0] || "")
      };
    }

    function getLoadedLibraryItems(){
      const categories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
      return categories.flatMap((category) => (demoData[category] || []).map((item) => ({ ...item, category })));
    }

    async function getLibraryItemsForRelations(){
      if(isPublicView){
        return getLoadedLibraryItems();
      }

      const user = await getCurrentUser();
      if(!user){
        invalidateRelatedLibraryItemsCache("");
        return getLoadedLibraryItems();
      }

      if(relatedLibraryItemsCache.loaded && relatedLibraryItemsCache.userId === user.id){
        return relatedLibraryItemsCache.items;
      }

      if(relatedLibraryItemsCache.promise && relatedLibraryItemsCache.userId === user.id){
        return await relatedLibraryItemsCache.promise;
      }

      relatedLibraryItemsCache.userId = user.id;
      relatedLibraryItemsCache.promise = (async () => {
        const { data, error } = await supabaseClient
          .from("user_media")
          .select("id, title, status, cover_url, creator, work_key, canonical_key, category")
          .eq("user_id", user.id)
          .order("id", { ascending: false });

        if(error){
          console.error("Relation library load error:", error);
          return getLoadedLibraryItems();
        }

        const seen = new Set();
        const items = (data || []).map((entry) => ({
          id: entry.id,
          title: entry.title || "",
          status: entry.status || "Planned",
          cover: entry.cover_url || "",
          creator: entry.creator || "",
          work_key: entry.work_key || "",
          canonical_key: entry.canonical_key || "",
          category: entry.category || "Books"
        })).filter((entry) => {
          const key = buildRelationIdentity(entry, entry.category);
          if(seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        relatedLibraryItemsCache.items = items;
        relatedLibraryItemsCache.loaded = true;
        return items;
      })();

      try {
        return await relatedLibraryItemsCache.promise;
      } finally {
        relatedLibraryItemsCache.promise = null;
      }
    }

    function finalizeComputedRelatedItems(source, matches = []){
      const seen = new Set();
      const sourceIdentity = source.identity;
      const sourceKeys = new Set([sourceIdentity, source.canonicalBase, source.workBase].filter(Boolean));
      return matches.filter((entry) => {
        const dedupeKey = entry.identity || entry.id || entry.canonical_key || entry.work_key || entry.titleKey;
        if(!dedupeKey || seen.has(dedupeKey)) return false;
        if(entry.identity === sourceIdentity) return false;
        if(entry.canonicalBase && sourceKeys.has(entry.canonicalBase) && entry.identity === sourceIdentity) return false;
        if(entry.workBase && sourceKeys.has(entry.workBase) && entry.identity === sourceIdentity) return false;
        seen.add(dedupeKey);
        return true;
      }).slice(0, 6);
    }

    function computeRelatedItems(item, category, collection = []){
      if(!item) return [];
      const source = buildRelationCandidateSnapshot(item, category);
      const candidates = collection
        .map((candidate) => buildRelationCandidateSnapshot(candidate, candidate.category || category))
        .filter((candidate) => candidate.identity !== source.identity);

      if(source.canonicalBase){
        const canonicalMatches = candidates.filter((candidate) => candidate.canonicalBase && candidate.canonicalBase === source.canonicalBase);
        if(canonicalMatches.length){
          return finalizeComputedRelatedItems(source, canonicalMatches);
        }
      }

      if(source.workBase){
        const workMatches = candidates.filter((candidate) => candidate.workBase && candidate.workBase === source.workBase);
        if(workMatches.length){
          return finalizeComputedRelatedItems(source, workMatches);
        }
      }

      if(!source.titleBase || source.titleBase.length < 3){
        return [];
      }

      const titleMatches = candidates.filter((candidate) => {
        if(!candidate.titleBase || candidate.titleBase !== source.titleBase) return false;
        if(source.creatorKey && candidate.creatorKey && source.creatorKey !== candidate.creatorKey){
          return false;
        }
        return true;
      });

      return finalizeComputedRelatedItems(source, titleMatches);
    }

    async function getRelatedItemsForItem(item, category = currentCategory){
      if(!item) return [];
      const cached = getCachedRelatedItems(item, category);
      if(cached) return cached;
      const libraryItems = await getLibraryItemsForRelations();
      return setCachedRelatedItems(item, category, computeRelatedItems(item, category, libraryItems));
    }

    async function openRelatedItemFromDetails(id, category){
      if(!id || !category) return;
      if(isPublicView){
        if(category !== currentCategory){
          openPublicCategory(category, currentPublicProfileName);
        }
        await openCardById(id);
        return;
      }

      if(category !== currentCategory){
        await openCategory(category);
      }
      await openCardById(id);
    }

    function buildRelatedItemCard(item){
      const button = document.createElement("button");
      button.type = "button";
      button.className = "related-work-card";
      button.addEventListener("click", () => openRelatedItemFromDetails(item.id, item.category));

      const cover = document.createElement("div");
      cover.className = "related-work-cover";
      if(item.cover){
        const image = document.createElement("img");
        image.src = item.cover;
        image.alt = item.title || t().labels.cover;
        cover.appendChild(image);
      } else {
        cover.textContent = t().labels.cover;
      }

      const body = document.createElement("div");
      body.className = "related-work-body";

      const title = document.createElement("div");
      title.className = "related-work-title";
      title.textContent = item.title || "—";

      const meta = document.createElement("div");
      meta.className = "related-work-meta";
      [translateCategory(item.category), translateStatus(item.status || "Planned")].filter(Boolean).forEach((value) => {
        const chip = document.createElement("span");
        chip.className = "related-work-chip";
        chip.textContent = value;
        meta.appendChild(chip);
      });

      body.appendChild(title);
      body.appendChild(meta);

      if(item.creator){
        const creator = document.createElement("div");
        creator.className = "related-work-creator";
        creator.textContent = item.creator;
        body.appendChild(creator);
      }

      button.appendChild(cover);
      button.appendChild(body);
      return button;
    }

    async function renderRelatedItemsSection(item, category = currentCategory){
      const list = document.getElementById("details-relations-list");
      const empty = document.getElementById("details-relations-empty");
      if(!list || !empty) return;

      list.innerHTML = "";
      empty.textContent = t().labels.relatedWorksEmpty;
      empty.classList.add("hidden");

      if(!item){
        empty.classList.remove("hidden");
        return;
      }

      const relatedItems = await getRelatedItemsForItem(item, category);
      if(currentOpenItemId !== item.id || currentCategory !== category){
        return;
      }

      if(!relatedItems.length){
        empty.classList.remove("hidden");
        return;
      }

      relatedItems.forEach((entry) => list.appendChild(buildRelatedItemCard(entry)));
    }

    function getOpenLibraryCoverUrl(coverId){
      if(!coverId) return "";
      return "https://covers.openlibrary.org/b/id/" + coverId + "-L.jpg";
    }

    function getBookSourcePriority(source, queryMeta = {}){
      const normalizedSource = String(source || "").toLowerCase();
      if(queryMeta.hasCyrillic){
        if(normalizedSource === "fantlab") return 32;
        if(normalizedSource === "google") return 18;
        if(normalizedSource === "openlibrary") return 10;
      }
      if(normalizedSource === "google") return 24;
      if(normalizedSource === "openlibrary") return 14;
      if(normalizedSource === "fantlab") return 12;
      return 0;
    }

    function buildBookIdentityKey(item = {}){
      if(item.isbn) return `isbn:${item.isbn}`;
      const titleKey = normalizeComparisonText(item.title || "");
      const authorKey = normalizeComparisonText(item.creator || "");
      return `meta:${titleKey}::${authorKey}`;
    }

    function isBookResultUsable(item = {}){
      const title = normalizeSpaces(item.title || "");
      const creator = normalizeSpaces(item.creator || "");
      const hasCover = Boolean(item.cover);
      const hasDescription = Boolean(item.description_ru || item.description_original || item.description_en || item.description);
      return Boolean(title) && (hasCover || hasDescription || creator || item.isbn);
    }

    function buildBookResultScore(item = {}, queryMeta = {}){
      const titleKey = normalizeComparisonText(item.title || "");
      const authorKey = normalizeComparisonText(item.creator || "");
      const queryKey = queryMeta.comparison || "";
      let score = getBookSourcePriority(item.source, queryMeta);

      if(item.isbn && queryMeta.isbn && item.isbn === queryMeta.isbn) score += 240;
      if(queryKey && titleKey === queryKey) score += 160;
      else if(queryKey && titleKey.startsWith(queryKey)) score += 90;
      else if(queryKey && titleKey.includes(queryKey)) score += 50;

      if(queryKey && authorKey === queryKey) score += 120;
      else if(queryKey && authorKey.includes(queryKey)) score += 70;

      if(item.cover) score += 20;
      if(item.description_ru) score += 18;
      if(item.description_original || item.description_en) score += 14;
      if(item.isbn) score += 12;

      const filledFields = ["title", "creator", "cover", "description_ru", "description_original", "isbn"].filter((field) => Boolean(item[field])).length;
      score += filledFields * 4;

      if(!isBookResultUsable(item)) score -= 120;
      return score;
    }

    function mergeBookResultPair(left = {}, right = {}, queryMeta = {}){
      const candidates = [left, right].filter(Boolean);
      const primary = candidates
        .slice()
        .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta))[0] || {};
      const secondary = primary === left ? right : left;

      const merged = {
        ...secondary,
        ...primary,
        title: primary.title || secondary?.title || "",
        creator: primary.creator || secondary?.creator || "",
        cover: primary.cover || secondary?.cover || "",
        isbn: primary.isbn || secondary?.isbn || "",
        description_ru: primary.description_ru || secondary?.description_ru || "",
        description_original: primary.description_original || secondary?.description_original || primary.description_en || secondary?.description_en || "",
        description_en: primary.description_en || secondary?.description_en || primary.description_original || secondary?.description_original || "",
        source_priority: Math.max(primary.source_priority || 0, secondary?.source_priority || 0)
      };

      merged.description = merged.description_ru || merged.description_original || merged.description_en || primary.description || secondary?.description || "";
      merged.canonical_key = merged.canonical_key || buildCanonicalKey("Books", merged.source || "merged", merged.isbn || merged.work_key || buildBookIdentityKey(merged), merged.title);
      return merged;
    }

    function mergeBookResults(results = [], queryMeta = {}){
      const grouped = new Map();
      results.filter(Boolean).forEach((item) => {
        const key = buildBookIdentityKey(item);
        if(!grouped.has(key)){
          grouped.set(key, item);
          return;
        }
        grouped.set(key, mergeBookResultPair(grouped.get(key), item, queryMeta));
      });
      return Array.from(grouped.values());
    }

    function mergeResults(results = [], queryMeta = {}){
      return mergeBookResults(results, queryMeta);
    }

    function dedupeBookResults(results = [], queryMeta = {}){
      return mergeBookResults(results, queryMeta);
    }

    function dedupeResults(results = [], queryMeta = {}){
      return dedupeBookResults(results, queryMeta);
    }

    function rankBookResults(results = [], queryMeta = {}){
      return results
        .filter((item) => isBookResultUsable(item))
        .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta));
    }

    function rankResults(results = [], queryMeta = {}){
      return rankBookResults(results, queryMeta);
    }

    function createBookResult({
      title = "",
      creator = "",
      cover = "",
      isbn = "",
      description = "",
      description_ru = "",
      description_original = "",
      description_en = "",
      work_key = "",
      canonical_key = "",
      source = "",
      queryMeta = {}
    } = {}){
      const safeTitle = normalizeSpaces(title);
      const safeCreator = normalizeSpaces(creator);
      const safeIsbn = detectISBN(isbn);
      const original = normalizeSpaces(description_original || description_en || (description_ru ? "" : description));
      const russian = normalizeSpaces(description_ru || (looksLikeRussian(description) ? description : ""));
      const displayDescription = russian || original || normalizeSpaces(description);

      return {
        title: safeTitle,
        category: "Books",
        creator: safeCreator,
        cover: cover || "",
        isbn: safeIsbn,
        description: displayDescription || "",
        description_ru: russian || "",
        description_original: original || "",
        description_en: description_en || original || "",
        work_key: work_key || "",
        source: source || "",
        source_priority: getBookSourcePriority(source, queryMeta),
        canonical_key: canonical_key || buildCanonicalKey("Books", source || "book", safeIsbn || work_key || buildBookIdentityKey({ title: safeTitle, creator: safeCreator }), safeTitle)
      };
    }

    function mapGoogleBooksVolumeToBookResult(book, queryMeta = {}){
      const info = book?.volumeInfo || {};
      const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
      const isbn = detectISBN(
        identifiers.find((item) => /ISBN/i.test(item?.type || ""))?.identifier
        || identifiers[0]?.identifier
        || ""
      );
      const description = info.description || "";
      const language = String(info.language || "").toLowerCase();
      return createBookResult({
        title: info.title || "",
        creator: Array.isArray(info.authors) ? info.authors.join(", ") : "",
        cover: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "",
        isbn,
        description,
        description_ru: language.startsWith("ru") || looksLikeRussian(description) ? description : "",
        description_original: language.startsWith("ru") ? "" : description,
        description_en: language.startsWith("en") || looksLikeEnglish(description) ? description : "",
        work_key: book.id ? `google:${book.id}` : "",
        source: "google",
        queryMeta
      });
    }

    function mapOpenLibraryDocToBookResult(book, queryMeta = {}){
      const isbn = detectISBN((Array.isArray(book.isbn) ? book.isbn[0] : book.isbn) || "");
      return createBookResult({
        title: book.title || "",
        creator: Array.isArray(book.author_name) ? book.author_name.join(", ") : "",
        cover: book.cover_i ? getOpenLibraryCoverUrl(book.cover_i) : "",
        isbn,
        work_key: book.key || "",
        source: "openlibrary",
        queryMeta
      });
    }

    function mapFantLabWorkToBookResult(item, queryMeta = {}){
      const title = item?.title || item?.name || item?.work_name || item?.work_title || "";
      const creator = item?.author_name || item?.authors?.map?.((author) => author?.name).filter(Boolean).join(", ") || "";
      const description = item?.description || item?.annotation || item?.work_description || "";
      const cover = item?.cover || item?.cover_url || item?.image || "";
      const workId = item?.work_id || item?.id || item?.workid || "";
      const isbn = detectISBN(item?.isbn || item?.isbn13 || item?.edition_isbn || "");
      return createBookResult({
        title,
        creator,
        cover,
        isbn,
        description,
        description_ru: looksLikeRussian(description) ? description : "",
        description_original: looksLikeRussian(description) ? "" : description,
        description_en: looksLikeEnglish(description) ? description : "",
        work_key: workId ? `fantlab:${workId}` : "",
        source: "fantlab",
        queryMeta
      });
    }

    function dedupeSearchResults(items){
      const seen = new Set();
      return items.filter(item => {
        const key = item.category === "Books"
          ? buildBookIdentityKey(item)
          : (item.canonical_key || item.work_key || (item.category + ":" + (item.title || "").trim().toLowerCase()));
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    async function fetchOpenLibraryDescription(workKey, preferredLang = currentLanguage){
      if(!workKey) return { text: "", language: "" };
      const normalizedWorkKey = String(workKey || "").trim();
      if(!normalizedWorkKey.startsWith("/works/") && !/^OL\d+W$/i.test(normalizedWorkKey)){
        return { text: "", language: "" };
      }

      try {
        const cleanKey = normalizedWorkKey.startsWith("/works/") ? normalizedWorkKey : `/works/${normalizedWorkKey}`;
        const workUrl = "https://openlibrary.org" + cleanKey + ".json";
        const workData = await fetchJson(workUrl);

        function extractDescription(obj){
          if(!obj) return "";
          if(typeof obj.description === "string") return obj.description.trim();
          if(obj.description && typeof obj.description.value === "string") return obj.description.value.trim();
          return "";
        }

        function detectLang(text){
          if(looksLikeRussian(text)) return "ru";
          if(looksLikeEnglish(text)) return "en";
          return "";
        }

        const workDescription = extractDescription(workData);
        const workLang = detectLang(workDescription);

        const targetLangKey = preferredLang === "ru" ? "/languages/rus" : "/languages/eng";
        const editionsUrl = "https://openlibrary.org" + cleanKey + "/editions.json?limit=30";

        try {
          const editionsData = await fetchJson(editionsUrl);
          const entries = Array.isArray(editionsData.entries)
            ? editionsData.entries
            : Array.isArray(editionsData.docs)
              ? editionsData.docs
              : [];

          for(const edition of entries){
            const languages = Array.isArray(edition.languages) ? edition.languages : [];
            const hasTargetLanguage = languages.some(lang => {
              if(!lang) return false;
              if(typeof lang === "string") return lang === targetLangKey;
              return lang.key === targetLangKey;
            });

            if(!hasTargetLanguage) continue;

            const editionDescription = extractDescription(edition);
            if(editionDescription){
              const lang = detectLang(editionDescription);
              return { text: editionDescription, language: lang };
            }

            const editionKey = edition.key || "";
            if(!editionKey) continue;

            try {
              const editionData = await fetchJson("https://openlibrary.org" + editionKey + ".json");
              const fullEditionDescription = extractDescription(editionData);
              if(fullEditionDescription){
                const lang = detectLang(fullEditionDescription);
                return { text: fullEditionDescription, language: lang };
              }
            } catch (e) {
              console.error("Edition description error:", e);
            }
          }
        } catch (e) {
          console.error("Open Library editions error:", e);
        }

        return { text: workDescription, language: workLang };
      } catch (error) {
        console.error("Open Library description error:", error);
        return { text: "", language: "" };
      }
    }

    async function fetchGoogleBooksDescription(title, author = "", preferredLang = currentLanguage){
      try {
        const targetLang = preferredLang === "ru" ? "ru" : "en";
        const isbn = detectISBN(title);

        let query = "";
        if(isbn){
          query = `isbn:${isbn}`;
        } else if(title && author){
          query = `intitle:${title} inauthor:${author}`;
        } else if(title){
          query = `intitle:${title}`;
        } else if(author){
          query = `inauthor:${author}`;
        } else {
          return { text: "", language: "", matchedLanguage: false };
        }

        function detectLang(text){
          if(looksLikeRussian(text)) return "ru";
          if(looksLikeEnglish(text)) return "en";
          return "";
        }

        async function tryRequest(url){
          const data = await fetchJson(url);
          const items = data.items || [];

          for(const book of items){
            const info = book.volumeInfo || {};
            const description = info.description || "";
            if(!description) continue;

            const lang = detectLang(description);
            if(lang === targetLang){
              return { text: description, language: lang, matchedLanguage: true };
            }
          }

          for(const book of items){
            const info = book.volumeInfo || {};
            const description = info.description || "";
            if(description){
              const lang = detectLang(description);
              return { text: description, language: lang, matchedLanguage: false };
            }
          }

          return { text: "", language: "", matchedLanguage: false };
        }

        const strictUrl =
          "https://www.googleapis.com/books/v1/volumes?q=" +
          encodeURIComponent(query) +
          "&langRestrict=" + encodeURIComponent(targetLang) +
          "&maxResults=10" +
          "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

        let result = await tryRequest(strictUrl);
        if(result.text) return result;

        const fallbackUrl =
          "https://www.googleapis.com/books/v1/volumes?q=" +
          encodeURIComponent(query) +
          "&maxResults=10" +
          "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

        result = await tryRequest(fallbackUrl);
        return result;
      } catch (error) {
        console.error("Google Books description error:", error);
        return { text: "", language: "", matchedLanguage: false };
      }
    }

    async function searchFantLab(queryMeta, limit = 10){
      if(!queryMeta?.text && !queryMeta?.isbn) return [];
      const queries = queryMeta.isbn ? [queryMeta.isbn] : await buildSearchQueries(queryMeta);
      const endpointBuilders = [
        (query) => `https://api.fantlab.ru/search?query=${encodeURIComponent(query)}`,
        (query) => `https://api.fantlab.ru/search?term=${encodeURIComponent(query)}`,
        (query) => `https://api.fantlab.ru/search/${encodeURIComponent(query)}`
      ];

      for(const query of queries){
        for(const buildUrl of endpointBuilders){
          try {
            const data = await fetchJson(buildUrl(query));
            const collections = [
              data?.works,
              data?.items,
              data?.data?.works,
              data?.data?.items,
              data?.result?.works
            ].filter(Array.isArray);
            const results = collections.flat().map((item) => mapFantLabWorkToBookResult(item, queryMeta));
            if(results.length){
              return results.slice(0, limit);
            }
          } catch (error) {
            console.error("FantLab search fallback:", error);
          }
        }
      }

      return [];
    }

    async function searchGoogleBooks(queryMeta, limit = 10){
      try {
        const queries = queryMeta.isbn ? [`isbn:${queryMeta.isbn}`] : await buildSearchQueries(queryMeta);
        const results = [];
        for(const query of queries){
          const url =
            "https://www.googleapis.com/books/v1/volumes?q=" +
            encodeURIComponent(query) +
            "&maxResults=" + encodeURIComponent(limit) +
            "&printType=books" +
            "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);
          const data = await fetchJson(url);
          const items = Array.isArray(data.items) ? data.items : [];
          results.push(...items.map((item) => mapGoogleBooksVolumeToBookResult(item, queryMeta)));
        }
        return results.slice(0, limit * Math.max(1, queries.length));
      } catch (error) {
        console.error("Google Books search error:", error);
        return [];
      }
    }

    async function searchOpenLibrary(queryMeta, limit = 10){
      try {
        const queries = queryMeta.isbn ? [queryMeta.isbn] : await buildSearchQueries(queryMeta);
        const results = [];
        for(const query of queries){
          const url = queryMeta.isbn
            ? "https://openlibrary.org/search.json?isbn=" + encodeURIComponent(query) + "&limit=" + limit
            : "https://openlibrary.org/search.json?q=" + encodeURIComponent(query) + "&limit=" + limit;
          const data = await fetchJson(url);
          const docs = Array.isArray(data.docs) ? data.docs : [];
          results.push(...docs.map((item) => mapOpenLibraryDocToBookResult(item, queryMeta)));
        }
        return results.slice(0, limit * Math.max(1, queries.length));
      } catch (error) {
        console.error("Open Library search error:", error);
        return [];
      }
    }

    async function buildBookDescriptions(title, author, workKey, isbn = ""){
      let description = "";
      let description_ru = "";
      let description_original = "";
      let description_en = "";
      const normalizedIsbn = detectISBN(isbn);

      const olCurrent = await fetchOpenLibraryDescription(workKey, currentLanguage);
      if(olCurrent.text){
        description = olCurrent.text;
        if(olCurrent.language === "ru") description_ru = olCurrent.text;
        if(olCurrent.language === "en") {
          description_original = olCurrent.text;
          description_en = olCurrent.text;
        }
      }

      if(!description_ru){
        const olRu = await fetchOpenLibraryDescription(workKey, "ru");
        if(olRu.text && looksLikeRussian(olRu.text)){
          description_ru = olRu.text;
          if(!description) description = olRu.text;
        }
      }

      if(!description_en){
        const olEn = await fetchOpenLibraryDescription(workKey, "en");
        if(olEn.text && looksLikeEnglish(olEn.text)){
          description_original = description_original || olEn.text;
          description_en = olEn.text;
          if(!description) description = olEn.text;
        }
      }

      if(!description_ru){
        const googleRu = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "ru");
        if(googleRu.text && looksLikeRussian(googleRu.text)){
          description_ru = googleRu.text;
          if(!description) description = googleRu.text;
        }
      }

      if(!description_en){
        const googleEn = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "en");
        if(googleEn.text && looksLikeEnglish(googleEn.text)){
          description_original = description_original || googleEn.text;
          description_en = googleEn.text;
          if(!description) description = googleEn.text;
        }
      }

      if(!description){
        description = description_ru || description_original || description_en || "";
      }

      return {
        description: description || "",
        description_ru: description_ru || "",
        description_original: description_original || description_en || "",
        description_en: description_en || description_original || ""
      };
    }

    async function translateDescriptionFields(description){
      let description_ru = "";
      let description_en = "";
      let description_original = "";
      if(looksLikeRussian(description)){
        description_ru = description;
        description_en = await translateTextToEnglish(description);
        description_original = description_en || "";
      } else if(looksLikeEnglish(description)){
        description_en = description;
        description_original = description;
        description_ru = await translateTextToRussian(description);
      }
      return {
        description: description || "",
        description_ru: description_ru || "",
        description_original: description_original || description_en || "",
        description_en: description_en || description_original || ""
      };
    }

    async function searchBooksApi(query, limit = 10){
      const queryMeta = normalizeQuery(query);
      if(!queryMeta.text && !queryMeta.isbn){
        return [];
      }

      try {
        const fantlab = queryMeta.hasCyrillic ? await searchFantLab(queryMeta, limit) : [];
        const google = await searchGoogleBooks(queryMeta, limit);
        const openLibrary = await searchOpenLibrary(queryMeta, limit);

        const merged = mergeResults([
          ...fantlab,
          ...google,
          ...openLibrary
        ], queryMeta);

        return rankResults(dedupeResults(merged, queryMeta), queryMeta).slice(0, limit);
      } catch (e) {
        console.error("Books search error:", e);
        return [];
      }
    }

    async function searchTMDbApi(query, mediaType = "movie", limit = 10){
      try {
        const languagesToTry = currentLanguage === "ru" ? ["ru-RU", "en-US"] : ["en-US", "ru-RU"];
        let results = [];

        for(const language of languagesToTry){
          const url = "https://api.themoviedb.org/3/search/" + mediaType +
            "?api_key=" + encodeURIComponent(TMDB_API_KEY) +
            "&query=" + encodeURIComponent(query) +
            "&language=" + encodeURIComponent(language) +
            "&page=1";

          const data = await fetchJson(url);
          const items = Array.isArray(data.results) ? data.results : [];
          results = results.concat(items);
          if(results.length >= limit) break;
        }

        const deduped = [];
        const seen = new Set();

        for(const item of results){
          const key = String(item.id || "");
          if(!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
          if(deduped.length >= limit) break;
        }

        return deduped.map(item => {
          const title = mediaType === "tv"
            ? (item.name || item.original_name || "Untitled")
            : (item.title || item.original_title || "Untitled");

          const overview = item.overview || "";
          const category = mediaType === "tv" ? "Series" : "Movies";
          const externalId = String(item.id || "");

          return {
            title,
            category,
            creator: "",
            cover: item.poster_path ? ("https://image.tmdb.org/t/p/w500" + item.poster_path) : "",
            description: overview,
            description_ru: looksLikeRussian(overview) ? overview : "",
            description_en: looksLikeEnglish(overview) ? overview : "",
            work_key: `tmdb:${mediaType}:${externalId}`,
            canonical_key: buildCanonicalKey(category, "tmdb", `${mediaType}:${externalId}`, title)
          };
        });
      } catch (e) {
        console.error("TMDb search error:", e);
        return [];
      }
    }

    async function searchJikanApi(query, kind = "anime", limit = 10){
      try {
        const url = "https://api.jikan.moe/v4/" + kind + "?q=" + encodeURIComponent(query) + "&limit=" + limit;
        const data = await fetchJson(url);
        const results = Array.isArray(data.data) ? data.data : [];

        return results.map(item => {
          const title = item.title || item.title_english || "Untitled";
          const creator =
            kind === "anime"
              ? ((item.studios || []).map(x => x.name).join(", "))
              : ((item.authors || []).map(x => x.name).join(", "));
          const synopsis = item.synopsis || "";
          const category = kind === "anime" ? "Anime" : "Manga";
          const externalId = String(item.mal_id || "");
          return {
            title,
            category,
            creator,
            cover: item.images?.jpg?.image_url || "",
            description: synopsis,
            description_ru: looksLikeRussian(synopsis) ? synopsis : "",
            description_en: looksLikeEnglish(synopsis) ? synopsis : "",
            work_key: `jikan:${kind}:${externalId}`,
            canonical_key: buildCanonicalKey(category, "jikan", `${kind}:${externalId}`, title)
          };
        });
      } catch (e) {
        console.error("Jikan search error:", e);
        return [];
      }
    }

    async function searchAniListApi(query, kind = "ANIME", limit = 10){
      try {
        const body = {
          query: `
            query ($search: String, $type: MediaType) {
              Page(page: 1, perPage: ${limit}) {
                media(search: $search, type: $type) {
                  id
                  title {
                    romaji
                    english
                    native
                  }
                  description(asHtml: false)
                  coverImage {
                    large
                  }
                  studios(isMain: true) {
                    nodes {
                      name
                    }
                  }
                }
              }
            }
          `,
          variables: {
            search: query,
            type: kind
          }
        };

        const data = await fetchJson("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body)
        });

        const results = data?.data?.Page?.media || [];
        return results.map(item => {
          const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
          const creator = (item.studios?.nodes || []).map(x => x.name).join(", ");
                     const description = String(item.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
          const category = kind === "ANIME" ? "Anime" : "Manga";
          return {
            title,
            category,
            creator,
            cover: item.coverImage?.large || "",
            description,
            description_ru: looksLikeRussian(description) ? description : "",
            description_en: looksLikeEnglish(description) ? description : "",
            work_key: `anilist:${kind.toLowerCase()}:${item.id}`,
            canonical_key: buildCanonicalKey(category, "anilist", `${kind.toLowerCase()}:${item.id}`, title)
          };
        });
      } catch (e) {
        console.error("AniList search error:", e);
        return [];
      }
    }

    async function searchAnimeApi(query, limit = 10){
      const jikan = await searchJikanApi(query, "anime", limit);
      if(jikan.length > 0) return jikan;
      return await searchAniListApi(query, "ANIME", limit);
    }

    async function searchMangaApi(query, limit = 10){
      const jikan = await searchJikanApi(query, "manga", limit);
      if(jikan.length > 0) return jikan;
      return await searchAniListApi(query, "MANGA", limit);
    }

    async function searchByCategory(category, query, limit = 10){
      if(category === "Books"){
        return await searchBooksApi(query, limit);
      }

      const searchQueries = await buildSearchQueries(query);
      let combined = [];

      for(const q of searchQueries){
        let results = [];
        if(category === "Books") results = await searchBooksApi(q, limit);
        if(category === "Movies") results = await searchTMDbApi(q, "movie", limit);
        if(category === "Series") results = await searchTMDbApi(q, "tv", limit);
        if(category === "Anime") results = await searchAnimeApi(q, limit);
        if(category === "Manga") results = await searchMangaApi(q, limit);

        combined = dedupeSearchResults([...combined, ...results]);
        if(combined.length >= limit) break;
      }

      return combined.slice(0, limit);
    }

    function isDuplicateItem(category, title, workKey = ""){
      const items = demoData[category] || [];

      return items.some(item => {
        if(workKey && item.work_key && item.work_key === workKey){
          return true;
        }
        return (item.title || "").trim().toLowerCase() === title.trim().toLowerCase();
      });
    }

    async function existsInSupabase(category, title, workKey = "", canonicalKey = ""){
      const user = await getCurrentUser();
      if(!user) return false;

      let query = supabaseClient
        .from("user_media")
        .select("id, title, work_key, canonical_key")
        .eq("user_id", user.id)
        .eq("category", category)
        .limit(20);

      if(workKey){
        query = query.eq("work_key", workKey);
      } else if(canonicalKey){
        query = query.eq("canonical_key", canonicalKey);
      } else {
        query = query.ilike("title", title);
      }

      const { data, error } = await query;

      if(error){
        console.error("Supabase duplicate check error:", error);
        return false;
      }

      return Array.isArray(data) && data.length > 0;
    }

    async function saveItemToSupabase(
      title,
      category,
      status,
      cover = "",
      description = "",
      creator = "",
      workKey = "",
      canonicalKey = "",
      description_ru = "",
      description_en = "",
      description_original = ""
    ){
      const user = await getCurrentUser();

      if(!user){
        alert(t().labels.mustBeLoggedIn);
        return false;
      }

      const finalCanonicalKey =
        canonicalKey ||
        workKey ||
        title.trim().toLowerCase();

      const autoLang = splitDescriptionFields(description);
      const originalDescription = description_original || description_en || autoLang.description_original || "";

      const insertData = {
        user_id: user.id,
        title: title,
        category: category,
        status: status || "Planned",
        cover_url: cover,
        description: description || "",
        creator: creator || "",
        work_key: workKey || "",
        canonical_key: finalCanonicalKey,
        description_ru: description_ru || autoLang.description_ru || "",
        description_en: originalDescription || autoLang.description_en || ""
      };

      const { error } = await supabaseClient
        .from("user_media")
        .insert([insertData]);

      if(error){
        console.error("Supabase insert error:", error);
        alert(t().labels.dbSaveError + ": " + error.message);
        return false;
      }

      return true;
    }

    function buildLocalShelfItem({
      title,
      category,
      status = "Planned",
      cover = "",
      description = "",
      creator = "",
      work_key = "",
      canonical_key = "",
      folder = "",
      isbn = "",
      description_ru = "",
      description_en = "",
      description_original = ""
    }){
      return {
        id: -Date.now() - Math.floor(Math.random() * 1000),
        title: title || "",
        category: category || "",
        status: status || "Planned",
        cover: cover || "",
        description: description || "",
        description_ru: description_ru || "",
        description_original: description_original || description_en || "",
        description_en: description_en || "",
        creator: creator || "",
        isbn: isbn || "",
        work_key: work_key || "",
        canonical_key: canonical_key || work_key || (title || "").trim().toLowerCase(),
        folder: folder || ""
      };
    }

    function insertLocalShelfItem(category, item){
      if(!category || !item){
        return;
      }

      if(!demoData[category]){
        demoData[category] = [];
      }

      const dedupeKey =
        item.canonical_key ||
        item.work_key ||
        normalizeSpaces(item.title || "").toLowerCase();

      const alreadyExists = demoData[category].some((row) => {
        const rowKey =
          row.canonical_key ||
          row.work_key ||
          normalizeSpaces(row.title || "").toLowerCase();

        return rowKey === dedupeKey;
      });

      if(!alreadyExists){
        demoData[category].unshift(item);
        clearRelationCache();
      }
    }

    async function applyFolderAssignmentsToItems(category){
      const assignments = await getFolderAssignments();
      (demoData[category] || []).forEach((item) => {
        item.folder = assignments[getItemStorageKey({ ...item, category })] || item.folder || "";
      });
    }

    async function renderAndSyncCategory(category){
      if(currentCategory !== category){
        return;
      }

      renderShelf();

      try {
        await loadCategoryFromSupabase(category);
      } catch (error) {
        console.error("Category sync error:", error);
      }
    }

    async function renderFolderModalOptions(){
      const list = document.getElementById("folder-modal-list");
      if(!list) return;

      const folders = await getAvailableFolders();
      const options = ["", ...folders];
      list.innerHTML = "";

      options.forEach((folder) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "folder-option" + (pendingFolderSelection === folder ? " is-active" : "");
        button.textContent = folder || t().labels.noFolder;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          pendingFolderSelection = folder;
          renderFolderModalOptions();
        });
        list.appendChild(button);
      });
    }

    async function openFolderModalById(id){
      if(!isOwnerControlAllowed()) return;
      const item = getItemById(currentCategory, id);
      if(!item) return;

      currentFolderModalItemId = id;
      pendingFolderSelection = item.folder || "";
      await renderFolderModalOptions();
      document.getElementById("folder-modal")?.classList.remove("hidden");
    }

    async function openFolderModalByCurrentItem(){
      if(!currentOpenItemId) return;
      await openFolderModalById(currentOpenItemId);
    }

    function closeFolderModal(){
      document.getElementById("folder-modal")?.classList.add("hidden");
      currentFolderModalItemId = null;
      pendingFolderSelection = "";
    }

    function closeFolderModalOnBackdrop(event){
      if(event?.target?.id === "folder-modal"){
        closeFolderModal();
      }
    }

    async function saveItemFolderFromModal(){
      if(!isOwnerControlAllowed()) return;
      const item = getItemById(currentCategory, currentFolderModalItemId);
      if(!item){
        closeFolderModal();
        return;
      }

      const assignments = await getFolderAssignments();
      assignments[getItemStorageKey({ ...item, category: currentCategory })] = pendingFolderSelection || "";
      await setFolderAssignments(assignments);

      item.folder = pendingFolderSelection || "";
      const user = await getCurrentUser();
      if(user && item?.id){
        const { error } = await supabaseClient
          .from("user_media")
          .update({ folder_name: pendingFolderSelection || null })
          .eq("user_id", user.id)
          .eq("id", item.id);

        if(error){
          console.error("Supabase folder update error:", error);
        }
      }
      closeFolderModal();
      renderShelf();

      if(currentOpenItemId === item.id && !document.getElementById("details-screen").classList.contains("hidden")){
        await openCardById(item.id);
      }

      alert(t().labels.folderSaved);
    }

    async function saveItemFolder(){
      await saveItemFolderFromModal();
    }

    async function updateStatusInSupabase(itemId, status){
      const user = await getCurrentUser();
      if(!user || !itemId) return false;

      const { error } = await supabaseClient
        .from("user_media")
        .update({ status: status })
        .eq("user_id", user.id)
        .eq("id", itemId);

      if(error){
        console.error("Supabase status update error:", error);
        return false;
      }

      return true;
    }

    async function updateCategoryInSupabase(itemId, newCategory, newStatus = null){
      const user = await getCurrentUser();
      if(!user || !itemId) return false;

      const updateData = { category: newCategory };
      if(newStatus !== null){
        updateData.status = newStatus;
      }

      const { error } = await supabaseClient
        .from("user_media")
        .update(updateData)
        .eq("user_id", user.id)
        .eq("id", itemId);

      if(error){
        console.error("Supabase category update error:", error);
        return false;
      }

      return true;
    }

    async function updateDescriptionsInSupabase(itemId, description, description_ru, description_en){
      const user = await getCurrentUser();
      if(!user || !itemId) return false;

      const { error } = await supabaseClient
        .from("user_media")
        .update({
          description: description || "",
          description_ru: description_ru || "",
          description_en: description_en || ""
        })
        .eq("user_id", user.id)
        .eq("id", itemId);

      if(error){
        console.error("Supabase description update error:", error);
        return false;
      }

      return true;
    }

  async function deleteItemFromSupabase(item, category = currentCategory){
      const user = await getCurrentUser();
      if(!user || !item?.id) return false;

      const targetCategory = category || item.category || "";

      const { data: rows, error: loadError } = await supabaseClient
        .from("user_media")
        .select("id, title, work_key, canonical_key")
        .eq("user_id", user.id)
        .eq("category", targetCategory);

      if(loadError){
        console.error("Supabase delete preload error:", loadError);
        return false;
      }

      const itemDedupeKey =
        item.canonical_key ||
        item.work_key ||
        normalizeSpaces(item.title || "").toLowerCase();

      const idsToDelete = (rows || [])
        .filter((row) => {
          const rowDedupeKey =
            row.canonical_key ||
            row.work_key ||
            normalizeSpaces(row.title || "").toLowerCase();

          return row.id === item.id || rowDedupeKey === itemDedupeKey;
        })
        .map((row) => row.id)
        .filter(Boolean);

      if(idsToDelete.length === 0){
        return true;
      }

      const { error } = await supabaseClient
        .from("user_media")
        .delete()
        .eq("user_id", user.id)
        .eq("category", targetCategory)
        .in("id", idsToDelete);

      if(error){
        console.error("Supabase delete error:", error);
        return false;
      }

      return true;
    }

    async function loadCategoryFromSupabase(category){
      const user = await getCurrentUser();

      if(!user){
        invalidateRelatedLibraryItemsCache("");
        demoData[category] = [];
        renderShelf();
        return false;
      }

      const { data, error } = await supabaseClient
        .from("user_media")
        .select("*")
        .eq("user_id", user.id)
        .eq("category", category)
        .order("id", { ascending: false });

      if(error){
        console.error("Supabase load error:", error);
        renderShelf();
        return false;
      }

      demoData[category] = [];
      const seen = new Set();

      data.forEach(item => {
        const dedupeKey =
          item.canonical_key ||
          item.work_key ||
          (item.title || "").trim().toLowerCase();

        if(seen.has(dedupeKey)){
          return;
        }

        seen.add(dedupeKey);

        demoData[category].push({
          id: item.id,
          title: item.title,
          status: item.status || "Planned",
          cover: item.cover_url || "",
          description: item.description || "",
          description_ru: item.description_ru || "",
          description_original: item.description_original || item.description_en || "",
          description_en: item.description_en || "",
          creator: item.creator || "",
          work_key: item.work_key || "",
          canonical_key: item.canonical_key || "",
          folder: item.folder_name || ""
        });
      });

      await applyFolderAssignmentsToItems(category);
      clearRelationCache();
      renderShelf();
      return true;
    }

    function closeCardMenu(){
      currentOpenMenuItemId = null;
      document.querySelectorAll(".media-card.menu-open").forEach((card) => {
        card.classList.remove("menu-open");
      });
      document.querySelectorAll(".media-menu-btn[aria-expanded='true']").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    }

    function toggleCardMenu(event, id){
      if(isPublicView){
        if(event){
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if(event){
        event.preventDefault();
        event.stopPropagation();
      }

      const nextId = currentOpenMenuItemId === id ? null : id;
      closeCardMenu();
      currentOpenMenuItemId = nextId;

      if(nextId === null){
        return;
      }

      const card = document.querySelector(`.media-card[data-item-id="${id}"]`);
      const button = card?.querySelector(".media-menu-btn");
      if(card){
        card.classList.add("menu-open");
      }
      if(button){
        button.setAttribute("aria-expanded", "true");
      }
    }

    async function openFolderPickerById(id){
      if(!isOwnerControlAllowed()) return;
      closeCardMenu();
      await openFolderModalById(id);
    }

    function renderShelf(){
      const shelf = document.getElementById("shelf");
      if(!shelf) return;

      closeCardMenu();
      shelf.innerHTML = "";
      syncShelfSearchInput();

      const filterToolbar = document.getElementById("filter-toolbar");
      const statusFilterWrap = document.getElementById("status-filter-wrap");
      if(filterToolbar){
        if(currentCategory === "Blacklist"){
          filterToolbar.classList.add("hidden");
        } else {
          filterToolbar.classList.remove("hidden");
        }
      }
      if(statusFilterWrap){
        statusFilterWrap.classList.toggle("hidden", currentCategory === "Blacklist");
      }

      const items = getFilteredItems();

      if(items.length === 0){
        shelf.innerHTML = `<div class="small">${escapeHtml(t().labels.noResults)}</div>`;
        return;
      }

      const createCard = (item) => {
        const coverHtml = item.cover
          ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">`
          : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;

        const creatorLine = item.creator
          ? `<div class="media-meta">${escapeHtml(item.creator)}</div>`
          : "";

        const menuHtml = isPublicView
          ? ""
          : `<div class="media-menu-wrap" onclick="event.stopPropagation()">
               <button
                 class="media-menu-btn"
                 type="button"
                 aria-label="${escapeHtml(t().buttons.moreActions)}"
                 aria-haspopup="true"
                 aria-expanded="false"
                 onclick="toggleCardMenu(event, ${item.id})"
               >⋮</button>
               <div class="media-menu" role="menu">
                 <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); openFolderPickerById(${item.id})">${escapeHtml(t().buttons.addToFolder)}</button>
                 <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); changeStatusById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.changeStatus)}</button>
                 <button class="media-menu-item media-menu-item-danger" type="button" role="menuitem" onclick="event.stopPropagation(); deleteItemById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.delete)}</button>
               </div>
             </div>`;

        const card = document.createElement("div");
        card.className = "media-card";
        card.dataset.itemId = item.id;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", item.title || t().buttons.open);
        card.innerHTML = `
          <div class="media-card-top">
            <div class="media-cover">
              ${coverHtml}
            </div>
            ${menuHtml}
          </div>
          <div class="media-info">
            <h3 class="media-title">${escapeHtml(item.title)}</h3>
            ${creatorLine}
            <div class="media-status">${escapeHtml(t().labels.statusLabel)}: ${escapeHtml(translateStatus(item.status || t().labels.unknownStatus))}</div>
          </div>
        `;
        card.addEventListener("click", () => openCardById(item.id));
        card.addEventListener("keydown", (event) => {
          if(event.key === "Enter" || event.key === " "){
            event.preventDefault();
            openCardById(item.id);
          }
        });

        return card;
      };

      const folders = [];
      const ungroupedItems = [];
      const grouped = new Map();

      items.forEach((item) => {
        const folder = getItemFolder(item);
        if(!folder){
          ungroupedItems.push(item);
          return;
        }

        if(!grouped.has(folder)){
          grouped.set(folder, []);
          folders.push(folder);
        }
        grouped.get(folder).push(item);
      });

      if(ungroupedItems.length){
        const defaultGrid = document.createElement("div");
        defaultGrid.className = "shelf";
        ungroupedItems.forEach((item) => defaultGrid.appendChild(createCard(item)));
        shelf.appendChild(defaultGrid);
      }

      folders.forEach((folder) => {
        const section = document.createElement("div");
        section.className = "folder-block";
        section.innerHTML = `<h3 class="folder-block-title">${escapeHtml(folder)}</h3>`;

        const folderGrid = document.createElement("div");
        folderGrid.className = "shelf";
        grouped.get(folder).forEach((item) => folderGrid.appendChild(createCard(item)));
        section.appendChild(folderGrid);
        shelf.appendChild(section);
      });
    }

    async function openCategory(name){
      closePreferencesPanel();
      isPublicView = false;
      currentCategory = name;
      resetShelfSearchQuery();

      hideAllScreens();
      document.getElementById("category-screen").classList.remove("hidden");
      document.getElementById("category-title").textContent = translateCategory(name);

      const addBtn = document.getElementById("add-new-btn");
      const addFolderBtn = document.getElementById("add-folder-btn");
      if(addBtn){
        if(name === "Blacklist"){
          addBtn.classList.add("hidden");
          addBtn.style.display = "none";
        } else {
          addBtn.classList.remove("hidden");
          addBtn.style.display = "";
        }
      }
      if(addFolderBtn){
        if(name === "Blacklist"){
          addFolderBtn.classList.add("hidden");
          addFolderBtn.style.display = "none";
        } else {
          addFolderBtn.classList.remove("hidden");
          addFolderBtn.style.display = "";
        }
      }

      const tabs = document.getElementById("public-category-tabs");
      if(tabs){
        tabs.classList.add("hidden");
        tabs.style.display = "none";
      }

      await loadCategoryFromSupabase(name);
    }

    async function renderCategorySearchResults() {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(async () => {
        const container = document.getElementById("search-results");
        const input = document.getElementById("search-input");

        if (!container || !input) return;

        const query = normalizeSpaces(input.value);
        container.innerHTML = "";

        if (!query) {
          container.innerHTML = `<div class="small">${escapeHtml(t().labels.noResults)}</div>`;
          return;
        }

        container.innerHTML = `<div class="small">${escapeHtml(t().labels.searching)}</div>`;

        try {
          const results = dedupeSearchResults(await searchByCategory(currentCategory, query, 10));
          currentSearchResults = results;

          if(results.length === 0){
            container.innerHTML = `
              <div class="small">${escapeHtml(t().labels.noResults)}</div>
              <div class="modal-actions" style="justify-content:flex-start;margin-top:12px;">
                <button class="button" onclick="openManualModal()">${escapeHtml(t().buttons.manualAdd)}</button>
              </div>
            `;
            return;
          }

          container.innerHTML = "";

          results.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "search-item";
            row.innerHTML = `
              <div class="search-item-left">
                <div class="search-thumb">
                  ${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">` : escapeHtml(t().labels.cover)}
                </div>
                <div class="search-item-text">
                  <div class="search-item-title">${escapeHtml(item.title)}</div>
                  <div class="search-item-meta">${escapeHtml(item.creator || "")}</div>
                </div>
              </div>
              <button class="button" onclick="addCategorySearchResult(${index})">${escapeHtml(t().buttons.add)}</button>
            `;
            container.appendChild(row);
          });
        } catch (error) {
          console.error("Category search error:", error);
          container.innerHTML = `
            <div class="small">${escapeHtml(t().labels.apiError)}: ${escapeHtml(error.message)}</div>
            <div class="modal-actions" style="justify-content:flex-start;margin-top:12px;">
              <button class="button" onclick="openManualModal()">${escapeHtml(t().buttons.manualAdd)}</button>
            </div>
          `;
        }
      }, 350);
    }

    async function addCategorySearchResult(index){
      if(!isOwnerControlAllowed()) return;
      const item = currentSearchResults[index];
      if(!item) return;
      await addSearchResultToLibrary(item);
      closeAddModal();
      await loadCategoryFromSupabase(currentCategory);
    }

    async function addSearchResultToLibrary(item){
      if(!isOwnerControlAllowed()) return;
      if(!item) return;

      const targetCategory = item.category;

      if(isDuplicateItem(targetCategory, item.title, item.work_key || "")){
        alert(t().labels.alreadyExists);
        return;
      }

      const existsInDb = await existsInSupabase(
        targetCategory,
        item.title,
        item.work_key || "",
        item.canonical_key || ""
      );

      if(existsInDb){
        alert(t().labels.alreadyExists);
        return;
      }

      let finalDescription = item.description || "";
      let finalDescriptionRu = item.description_ru || "";
      let finalDescriptionOriginal = item.description_original || item.description_en || "";
      let finalDescriptionEn = item.description_en || "";

      if(targetCategory === "Books"){
        const built = await buildBookDescriptions(item.title, item.creator || "", item.work_key || "", item.isbn || "");
        finalDescription = built.description || "";
        finalDescriptionRu = built.description_ru || "";
        finalDescriptionOriginal = built.description_original || built.description_en || "";
        finalDescriptionEn = built.description_en || built.description_original || "";
      } else if(finalDescription && (!finalDescriptionRu || !finalDescriptionEn)){
        const translated = await translateDescriptionFields(finalDescription);
        finalDescription = translated.description || finalDescription;
        finalDescriptionRu = finalDescriptionRu || translated.description_ru || "";
        finalDescriptionOriginal = finalDescriptionOriginal || translated.description_original || translated.description_en || "";
        finalDescriptionEn = finalDescriptionEn || translated.description_en || translated.description_original || "";
      }

      const saved = await saveItemToSupabase(
        item.title,
        targetCategory,
        "Planned",
        item.cover || "",
        finalDescription || "",
        item.creator || "",
        item.work_key || "",
        item.canonical_key || "",
        finalDescriptionRu || "",
        finalDescriptionEn || "",
        finalDescriptionOriginal || ""
      );

      if(!saved) return;

      insertLocalShelfItem(targetCategory, buildLocalShelfItem({
        title: item.title,
        category: targetCategory,
        status: "Planned",
        cover: item.cover || "",
        description: finalDescription || "",
        creator: item.creator || "",
        isbn: item.isbn || "",
        work_key: item.work_key || "",
        canonical_key: item.canonical_key || "",
        description_ru: finalDescriptionRu || "",
        description_original: finalDescriptionOriginal || finalDescriptionEn || "",
        description_en: finalDescriptionEn || ""
      }));

      await renderAndSyncCategory(targetCategory);
    }

    async function saveManualItem(){
      if(!isOwnerControlAllowed()) return;
      const title = document.getElementById("manual-name").value.trim();
      const creator = document.getElementById("manual-creator").value.trim();
      const cover = document.getElementById("manual-cover").value.trim();
      const description = document.getElementById("manual-description").value.trim();

      if(!title){
        alert(t().labels.manualNameRequired);
        return;
      }

      const canonicalKey = buildCanonicalKey(currentCategory, "manual", "", title);

      if(isDuplicateItem(currentCategory, title)){
        alert(t().labels.alreadyExists);
        return;
      }

      const existsInDb = await existsInSupabase(currentCategory, title, "", canonicalKey);
      if(existsInDb){
        alert(t().labels.alreadyExists);
        await loadCategoryFromSupabase(currentCategory);
        return;
      }

      const translated = await translateDescriptionFields(description);

      const saved = await saveItemToSupabase(
        title,
        currentCategory,
        "Planned",
        cover,
        description,
        creator,
        "",
        canonicalKey,
        translated.description_ru,
        translated.description_en,
        translated.description_original
      );

      if(!saved) return;

      insertLocalShelfItem(currentCategory, buildLocalShelfItem({
        title: title,
        category: currentCategory,
        status: "Planned",
        cover: cover,
        description: description,
        creator: creator,
        isbn: "",
        canonical_key: canonicalKey,
        description_ru: translated.description_ru,
        description_original: translated.description_original || translated.description_en,
        description_en: translated.description_en
      }));

      closeManualModal();
      closeAddModal();
      await renderAndSyncCategory(currentCategory);
    }

    function changeStatusById(id){
      if(!isOwnerControlAllowed()) return;
      closeCardMenu();
      const item = getItemById(currentCategory, id);
      if(!item) return;
      currentStatusItemId = id;
      currentOpenItemId = id;
      renderStatusOptions();
      document.getElementById("status-modal").classList.remove("hidden");
    }

    function changeStatusFromDetails(){
      if(!isOwnerControlAllowed()) return;
      const item = getItemById(currentCategory, currentOpenItemId);
      if(!item){
        alert(t().labels.itemNotFound);
        return;
      }
      currentStatusItemId = item.id;
      renderStatusOptions();
      document.getElementById("status-modal").classList.remove("hidden");
    }

    async function setStatus(status){
      if(!isOwnerControlAllowed()) return;
      const item = getItemById(currentCategory, currentStatusItemId);
      if(!item) return;

      const oldStatus = item.status;
      item.status = status;
      renderShelf();
      closeStatusModal();

      const updated = await updateStatusInSupabase(item.id, status);

      if(!updated){
        item.status = oldStatus;
        renderShelf();
        alert(t().labels.dbStatusNotSaved);
        return;
      }

      if(currentOpenItemId === item.id && !document.getElementById("details-screen").classList.contains("hidden")){
        openCardById(currentOpenItemId);
      }
    }

    async function moveCurrentItemToBlacklist(){
      if(isPublicView) return;
      if(currentCategory === "Blacklist"){
        closeStatusModal();
        return;
      }

      const item = getItemById(currentCategory, currentStatusItemId);
      if(!item) return;

      const confirmed = confirm(t().labels.confirmMoveToBlacklist);
      if(!confirmed) return;

      const oldCategory = currentCategory;
      const oldIndex = (demoData[oldCategory] || []).findIndex(x => x.id === item.id);
      const movedItem = { ...item, status: "Dropped" };

      if(oldIndex !== -1){
        demoData[oldCategory].splice(oldIndex, 1);
      }

      const alreadyThere = demoData.Blacklist.some(x => x.id === item.id || (x.canonical_key && x.canonical_key === item.canonical_key));
      if(!alreadyThere){
        demoData.Blacklist.unshift(movedItem);
      }

      clearRelationCache();
      closeStatusModal();
      renderShelf();

      const updated = await updateCategoryInSupabase(item.id, "Blacklist", "Dropped");

      if(!updated){
        if(oldIndex !== -1){
          demoData[oldCategory].splice(oldIndex, 0, item);
        }
        demoData.Blacklist = demoData.Blacklist.filter(x => x.id !== item.id);
        renderShelf();
        alert(t().labels.moveError);
        return;
      }

      if(currentOpenItemId === item.id){
        currentCategory = "Blacklist";
        openCardById(item.id);
      }
    }

    async function saveCanonicalKey(){
      if(!isOwnerControlAllowed()) return;
      const keyInput = document.getElementById("canonical-key-input");
      if(!keyInput) return;

      const key = keyInput.value.trim();
      if(!key) return;

      const user = await getCurrentUser();
      if(!user){
        alert(t().labels.mustBeLoggedIn);
        return;
      }

      const item = getItemById(currentCategory, currentOpenItemId);
      if(!item?.id){
        alert(t().labels.itemNotFound);
        return;
      }

      const { error } = await supabaseClient
        .from("user_media")
        .update({ canonical_key: key })
        .eq("user_id", user.id)
        .eq("id", item.id);

      if(error){
        console.error("Canonical key update error:", error);
        alert(t().labels.canonicalSaveError);
        return;
      }

      item.canonical_key = key;
      clearRelationCache();
      await loadCategoryFromSupabase(currentCategory);
      alert(t().labels.canonicalSaved);
    }

    async function ensureItemDescriptions(item){
      if(!item) return item;

      let changed = false;

      if(currentCategory === "Books"){
        if(!item.description_ru || !item.description_original || !item.description){
          const descriptions = await buildBookDescriptions(
            item.title || "",
            item.creator || "",
            item.work_key || "",
            item.isbn || ""
          );

          if(descriptions.description && descriptions.description !== item.description){
            item.description = descriptions.description;
            changed = true;
          }
          if(descriptions.description_ru && descriptions.description_ru !== item.description_ru){
            item.description_ru = descriptions.description_ru;
            changed = true;
          }
          if(descriptions.description_original && descriptions.description_original !== item.description_original){
            item.description_original = descriptions.description_original;
            changed = true;
          }
          if(descriptions.description_en && descriptions.description_en !== item.description_en){
            item.description_en = descriptions.description_en;
            changed = true;
          }
        }
      } else {
        if(currentLanguage === "ru" && !item.description_ru && item.description){
          if(looksLikeRussian(item.description)){
            item.description_ru = item.description;
            changed = true;
          } else if(looksLikeEnglish(item.description)){
            const translated = await translateTextToRussian(item.description);
            if(translated){
              item.description_ru = translated;
              changed = true;
            }
          }
        }

        if(currentLanguage === "en" && !item.description_en && item.description){
          if(looksLikeEnglish(item.description)){
            item.description_en = item.description;
            changed = true;
          } else if(looksLikeRussian(item.description)){
            const translated = await translateTextToEnglish(item.description);
            if(translated){
              item.description_en = translated;
              changed = true;
            }
          }
        }
      }

      if(changed && !isPublicView){
        await updateDescriptionsInSupabase(
          item.id,
          item.description || "",
          item.description_ru || "",
          item.description_en || ""
        );
      }

      return item;
    }

    async function openCardById(id){
      closeCardMenu();
      currentOpenItemId = id;
      const item = getItemById(currentCategory, id);

      hideAllScreens();
      document.getElementById("details-screen").classList.remove("hidden");

      document.getElementById("details-title").textContent = item?.title || "";
      document.getElementById("details-creator").textContent = item?.creator || "";
      document.getElementById("details-category").textContent = translateCategory(currentCategory);
      document.getElementById("details-status").textContent = item ? translateStatus(item.status) : t().labels.unknownStatus;

      const coverBox = document.getElementById("details-cover-box");
      if(item && item.cover){
        coverBox.innerHTML = `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">`;
      } else {
        coverBox.textContent = t().labels.cover;
      }

      const descriptionEl = document.getElementById("details-description");

      if(!item){
        descriptionEl.textContent = t().labels.noDescription;
      } else {
        descriptionEl.textContent = t().labels.searching;
        await ensureItemDescriptions(item);
        const bestDescription = pickBestDescription(item, currentLanguage);
        descriptionEl.textContent = bestDescription || t().labels.noDescription;
      }

      const canonicalSection = document.getElementById("canonical-key-section");
      const canonicalInput = document.getElementById("canonical-key-input");
      const folderSection = document.getElementById("details-folder-section");
      const folderCurrent = document.getElementById("details-folder-current");
      const folderButton = document.getElementById("open-folder-modal-btn");

      if(canonicalInput && canonicalSection){
        canonicalSection.classList.add("hidden");
        canonicalInput.value = item?.canonical_key || "";
      }

      if(folderSection && folderCurrent && folderButton){
        if(isPublicView){
          folderSection.classList.add("hidden");
        } else {
          folderSection.classList.remove("hidden");
          folderCurrent.textContent = item?.folder || t().labels.noFolder;
          folderButton.disabled = !item;
        }
      }

      const statusBtn = document.getElementById("change-status-details-btn");
      const deleteBtn = document.getElementById("delete-details-btn");

      if(statusBtn){
        if(isPublicView){
          statusBtn.classList.add("hidden");
        } else {
          statusBtn.classList.remove("hidden");
        }
      }

      if(deleteBtn){
        if(isPublicView){
          deleteBtn.classList.add("hidden");
        } else {
          deleteBtn.classList.remove("hidden");
        }
      }
    }

    async function deleteItemById(id){
      if(isPublicView) return;

      const item = getItemById(currentCategory, id);
      if(!item) return;

      const confirmed = confirm(t().labels.confirmDelete);
      if(!confirmed) return;

      const index = (demoData[currentCategory] || []).findIndex(x => x.id === id);
      const removedItem = item;

      if(index !== -1){
        demoData[currentCategory].splice(index, 1);
        clearRelationCache();
      }
      renderShelf();

      const deleted = await deleteItemFromSupabase(removedItem, currentCategory);

      if(!deleted){
        if(index !== -1){
          demoData[currentCategory].splice(index, 0, removedItem);
        }
        renderShelf();
        alert(t().labels.deleteError);
        return;
      }

      if(currentOpenItemId === removedItem.id){
        currentOpenItemId = null;
      }

      await loadCategoryFromSupabase(currentCategory);
    }

    document.addEventListener("click", (event) => {
      if(!event.target.closest(".media-menu-wrap")){
        closeCardMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape"){
        closeCardMenu();
      }
    });

    async function deleteCurrentItem(){
      if(isPublicView) return;
      if(!currentOpenItemId) return;

      const item = getItemById(currentCategory, currentOpenItemId);
      if(!item){
        alert(t().labels.itemNotFound);
        return;
      }

      const confirmed = confirm(t().labels.confirmDelete);
      if(!confirmed) return;

      const index = (demoData[currentCategory] || []).findIndex(x => x.id === item.id);
      if(index !== -1){
        demoData[currentCategory].splice(index, 1);
        clearRelationCache();
      }

      const deleted = await deleteItemFromSupabase(item, currentCategory);

      if(!deleted){
        if(index !== -1){
          demoData[currentCategory].splice(index, 0, item);
        }
        alert(t().labels.deleteError);
        return;
      }

      currentOpenItemId = null;
      backToCategory();
     await loadCategoryFromSupabase(currentCategory);
    }

    async function register(){
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      const { error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
      });

      if(error){
        alert(error.message);
        return;
      }

      alert(t().labels.userCreatedCheckEmail);
    }

    async function login(){
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      const { error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if(error){
        alert(error.message);
        return;
      }

      await showAuthorizedUI();
    }

    async function logout(){
      closeProfileModal();
      await supabaseClient.auth.signOut();
      location.reload();
    }

    function setAuthorizedButtons(isAuthorized){
      const loginBtn = document.getElementById("login-top-btn");
      const profileBtn = document.getElementById("profile-btn");

      if(loginBtn){
        loginBtn.classList.toggle("hidden", isAuthorized);
      }

      if(profileBtn){
        profileBtn.classList.toggle("hidden", !isAuthorized);
      }

      if(!isAuthorized){
        setAvatarPreview("", "", "");
      }
    }

async function showAuthorizedUI(){
  closePreferencesPanel();
  setPublicRouteMode(false);
  hideAllScreens();
  document.getElementById("home-screen").classList.remove("hidden");

      setAuthorizedButtons(true);
      refreshAccountCollectionsUI();
      safeLoadProfile("showAuthorizedUI");
    }

    async function checkAuth(){
      const user = await getCurrentUser();

      if(activeShareToken){
        setAuthorizedButtons(Boolean(user));
        if(user){
          await ensureCurrentProfileData();
        }
        return;
      }

      if(!user){
        document.getElementById("auth-screen").classList.remove("hidden");
        document.getElementById("home-screen").classList.add("hidden");
        setAuthorizedButtons(false);
        refreshAccountCollectionsUI();
      } else {
        await showAuthorizedUI();
      }
    }

function setAvatarPreview(url, displayName = "", username = ""){
  const avatarImg = document.getElementById("avatar-img");
  const avatarFallback = document.getElementById("avatar-fallback");
  const headerAvatarImg = document.getElementById("header-avatar-img");
  const headerAvatarFallback = document.getElementById("header-avatar-fallback");
  const initials = getProfileInitials(displayName, username);
  const hasUrl = Boolean(url && String(url).trim());

  [avatarFallback, headerAvatarFallback].forEach((node) => {
    if(node){
      node.textContent = initials;
      node.classList.toggle("hidden", hasUrl);
    }
  });

  [avatarImg, headerAvatarImg].forEach((img) => {
    if(!img) return;
    if(hasUrl){
      img.src = url;
      img.classList.remove("hidden");
    } else {
      img.src = "";
      img.classList.add("hidden");
    }
  });
}

function togglePasswordVisibility(){
  const newPassword = document.getElementById("new-password");
  const confirmPassword = document.getElementById("confirm-password");
  const showPassword = document.getElementById("profile-show-password");

  if(!newPassword || !confirmPassword || !showPassword) return;

  const nextType = showPassword.checked ? "text" : "password";

  newPassword.type = nextType;
  confirmPassword.type = nextType;
}

async function fetchProfileByUserId(userId){
  if(!userId) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if(error){
    console.error("Profile fetch error:", error);
    throw error;
  }

  return data || null;
}

async function fetchNfcTagByToken(token){
  if(!token) return null;

  const { data, error } = await supabaseClient
    .from("nfc_tags")
    .select("id, user_id, token, is_active, created_at, updated_at")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if(error){
    console.error("NFC tag fetch error:", error);
    return null;
  }

  return data || null;
}

async function ensureCurrentUserNfcTag(){
  const user = await getCurrentUser();
  if(!user) return null;

  const { data: existing, error: existingError } = await supabaseClient
    .from("nfc_tags")
    .select("id, user_id, token, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if(existingError){
    console.error("NFC tag lookup error:", existingError);
    return null;
  }

  if(existing){
    return existing;
  }

  const payload = {
    user_id: user.id,
    token: generateToken(24),
    is_active: true
  };

  const { data, error } = await supabaseClient
    .from("nfc_tags")
    .insert(payload)
    .select("id, user_id, token, is_active, created_at, updated_at")
    .single();

  if(error){
    console.error("NFC tag create error:", error);
    return null;
  }

  return data || null;
}

async function regenerateCurrentUserNfcTag(){
  const user = await getCurrentUser();
  if(!user) return null;

  const existing = await ensureCurrentUserNfcTag();
  if(!existing?.id) return null;

  const { data, error } = await supabaseClient
    .from("nfc_tags")
    .update({
      token: generateToken(24),
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .eq("user_id", user.id)
    .select("id, user_id, token, is_active, created_at, updated_at")
    .single();

  if(error){
    console.error("NFC tag regenerate error:", error);
    return null;
  }

  return data || null;
}

async function saveLibraryFallback(ownerProfileId, token){
  const saved = await getAccountStorageValue("saved_libraries", []);
  const next = Array.isArray(saved) ? saved : [];
  const exists = next.some((item) => item.owner_profile_id === ownerProfileId || item.nfc_token === token);
  if(exists){
    currentSavedLibraryState = { saved: true, source: "local" };
    return "exists";
  }

  next.unshift({
    owner_profile_id: ownerProfileId,
    nfc_token: token,
    saved_at: new Date().toISOString()
  });
  await setAccountStorageValue("saved_libraries", next);
  currentSavedLibraryState = { saved: true, source: "local" };
  return "saved";
}

async function getSavedLibraryState(ownerProfileId, token){
  const user = await getCurrentUser();
  if(!user || !ownerProfileId){
    currentSavedLibraryState = { saved: false, source: "none" };
    return currentSavedLibraryState;
  }

  const { data, error } = await supabaseClient
    .from("saved_libraries")
    .select("id")
    .eq("user_id", user.id)
    .eq("owner_profile_id", ownerProfileId)
    .limit(1);

  if(error){
    console.error("Saved library lookup error:", error);
    const saved = await getAccountStorageValue("saved_libraries", []);
    const exists = Array.isArray(saved) && saved.some((item) => item.owner_profile_id === ownerProfileId || item.nfc_token === token);
    currentSavedLibraryState = { saved: exists, source: exists ? "local" : "none" };
    return currentSavedLibraryState;
  }

  currentSavedLibraryState = { saved: Boolean(data?.length), source: data?.length ? "remote" : "none" };
  return currentSavedLibraryState;
}

async function saveCurrentLibraryToCollection(){
  const ownerProfileId = currentPublicProfile?.id || currentNfcContext?.ownerId || null;
  const token = currentNfcContext?.token || activeShareToken || currentPublicProfile?.public_share_token || "";
  const user = await getCurrentUser();

  if(!user){
    alert(t().share.loginToSave);
    showAuthScreen();
    return;
  }

  if(user.id === ownerProfileId){
    alert(t().share.ownLibrary);
    return;
  }

  if(!ownerProfileId){
    alert(t().share.unavailable);
    return;
  }

  const nfcTagId = currentNfcContext?.tagId || null;
  const payload = {
    user_id: user.id,
    owner_profile_id: ownerProfileId,
    nfc_tag_id: nfcTagId,
    nfc_token: token || null
  };

  const { error } = await supabaseClient
    .from("saved_libraries")
    .insert(payload);

  if(error){
    if(/duplicate|unique/i.test(String(error.message || ""))){
      currentSavedLibraryState = { saved: true, source: "remote" };
      updatePublicSaveButton();
      alert(t().share.alreadySaved);
      return;
    }

    console.error("Saved library insert error:", error);
    const result = await saveLibraryFallback(ownerProfileId, token);
    updatePublicSaveButton();
    alert(result === "exists" ? t().share.alreadySaved : t().share.savedToMine);
    return;
  }

  currentSavedLibraryState = { saved: true, source: "remote" };
  updatePublicSaveButton();
  alert(t().share.savedToMine);
}

function extractRpcToken(data){
  if(!data) return "";
  if(typeof data === "string") return data;
  if(Array.isArray(data)){
    return extractRpcToken(data[0]);
  }
  return data.public_share_token || data.token || data.p_token || data.share_token || "";
}

async function ensureProfileShareTokenRpc(){
  const { data, error } = await supabaseClient.rpc("ensure_profile_share_token");
  if(error){
    console.error("ensure_profile_share_token error:", error);
    throw error;
  }
  return extractRpcToken(data);
}

async function regenerateProfileShareTokenRpc(){
  const { data, error } = await supabaseClient.rpc("regenerate_profile_share_token");
  if(error){
    console.error("regenerate_profile_share_token error:", error);
    throw error;
  }
  return extractRpcToken(data);
}

function normalizePublicLibraryItem(item = {}){
  const category = item.category || item.media_category || item.item_category || "Books";
  const title = item.title || item.name || item.media_title || "";
  return {
    id: item.id || item.media_id || item.item_id || `${category}:${title}`,
    title,
    category,
    status: item.status || item.media_status || "Planned",
    cover_url: item.cover_url || item.cover || item.image_url || "",
    description: item.description || item.media_description || "",
    description_ru: item.description_ru || "",
    description_en: item.description_en || "",
    creator: item.creator || item.author || item.director || item.studio || "",
    work_key: item.work_key || item.media_work_key || "",
    canonical_key: item.canonical_key || item.media_canonical_key || "",
    folder_name: item.folder_name || item.folder || ""
  };
}

async function fetchPublicProfileByToken(token){
  if(!token) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, public_card_title, public_card_bio, public_share_enabled, public_share_token, public_library_mode")
    .eq("public_share_token", token)
    .maybeSingle();

  if(error){
    console.error("Public profile by token error:", error);
    throw error;
  }

  return data || null;
}

async function fetchPublicShareLibraryItems(ownerProfileId){
  if(!ownerProfileId) return [];

  let { data, error } = await supabaseClient
    .from("user_media")
    .select("*")
    .eq("user_id", ownerProfileId)
    .or("is_public.is.null,is_public.eq.true")
    .order("id", { ascending: false });

  if(error && /is_public/i.test(error.message || "")){
    ({ data, error } = await supabaseClient
      .from("user_media")
      .select("*")
      .eq("user_id", ownerProfileId)
      .order("id", { ascending: false }));
  }

  if(error){
    console.error("Public library items error:", error);
    throw error;
  }

  return (data || []).map(normalizePublicLibraryItem);
}

function normalizePublicProfileRpcPayload(data){
  const rows = Array.isArray(data) ? data.filter(Boolean) : (data ? [data] : []);
  if(rows.length === 0){
    return { profile: null, items: [] };
  }

  const first = rows[0];
  const nestedProfile = first.profile && typeof first.profile === "object" ? first.profile : null;
  const profileSource = nestedProfile || first;
  const profile = {
    ...profileSource,
    id: profileSource.id || profileSource.profile_id || profileSource.user_id || profileSource.owner_id || null,
    username: profileSource.username || profileSource.profile_username || "",
    display_name: profileSource.display_name || profileSource.profile_display_name || profileSource.public_card_title || "",
    avatar_url: profileSource.avatar_url || profileSource.profile_avatar_url || "",
    public_card_title: profileSource.public_card_title || profileSource.display_name || profileSource.username || "",
    public_card_bio: profileSource.public_card_bio || profileSource.bio || profileSource.profile_bio || "",
    public_share_enabled: typeof profileSource.public_share_enabled === "boolean"
      ? profileSource.public_share_enabled
      : profileSource.is_public !== false,
    public_share_token: profileSource.public_share_token || profileSource.token || profileSource.p_token || activeShareToken || "",
    public_library_mode: profileSource.public_library_mode || "preview"
  };

  const nestedItems =
    (Array.isArray(first.library_items) && first.library_items) ||
    (Array.isArray(first.items) && first.items) ||
    (Array.isArray(first.media_items) && first.media_items) ||
    (Array.isArray(first.library) && first.library) ||
    [];

  const items = nestedItems.length > 0
    ? nestedItems.map(normalizePublicLibraryItem)
    : rows
        .filter((row) => row.title || row.name || row.media_title)
        .map(normalizePublicLibraryItem);

  return { profile, items };
}

async function ensureCurrentProfileData(){
  const user = await getCurrentUser();
  if(!user) return null;

  let profile = await fetchProfileByUserId(user.id);
  const nfcTag = await ensureCurrentUserNfcTag();
  if(!profile?.public_share_token){
    try {
      const ensuredToken = await ensureProfileShareTokenRpc();
      profile = {
        ...(profile || {}),
        ...(await fetchProfileByUserId(user.id) || {}),
        public_share_token: ensuredToken || profile?.public_share_token || ""
      };
    } catch (error) {
      console.error("Ensure share token fallback error:", error);
      profile = {
        ...(profile || {}),
        public_share_token: profile?.public_share_token || ""
      };
    }
  }

  currentProfileData = profile
    ? {
        ...profile,
        nfc_tag_id: nfcTag?.id || null,
        nfc_token: nfcTag?.token || profile?.public_share_token || "",
        public_share_enabled: isShareEnabled(profile),
        public_library_mode: getShareLibraryMode(profile)
      }
    : {
        id: user.id,
        nfc_tag_id: nfcTag?.id || null,
        nfc_token: nfcTag?.token || "",
        public_share_enabled: true,
        public_share_token: "",
        public_library_mode: "preview"
      };

  return currentProfileData;
}

async function upsertCurrentProfilePatch(patch = {}){
  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return null;
  }

  const existing = await ensureCurrentProfileData();
  const nextProfile = {
    ...(existing || {}),
    ...patch,
    id: user.id
  };

  if(!nextProfile.public_share_token){
    try {
      nextProfile.public_share_token = await ensureProfileShareTokenRpc();
    } catch (_error) {
      nextProfile.public_share_token = existing?.public_share_token || "";
    }
  }

  if(typeof nextProfile.public_share_enabled !== "boolean"){
    nextProfile.public_share_enabled = isShareEnabled(existing || {});
  }

  if(typeof nextProfile.is_public !== "boolean"){
    nextProfile.is_public = nextProfile.public_share_enabled;
  }

  const payload = {
    id: user.id,
    username: nextProfile.username || null,
    display_name: nextProfile.display_name || null,
    avatar_url: nextProfile.avatar_url || null,
    is_public: nextProfile.public_share_enabled,
    public_share_enabled: nextProfile.public_share_enabled,
    public_share_token: nextProfile.public_share_token,
    public_card_title: nextProfile.public_card_title || null,
    public_card_bio: nextProfile.public_card_bio || null,
    public_library_mode: getShareLibraryMode(nextProfile)
  };

  const { error } = await supabaseClient
    .from("profiles")
    .upsert(payload);

  if(error){
    console.error("Profile upsert error:", error);
    alert(error.message);
    return null;
  }

  currentProfileData = { ...nextProfile, ...payload };
  return currentProfileData;
}

function applyShareSettingsToOwnerPanels(profile = {}){
  const token = profile.nfc_token || profile.public_share_token || "";
  const url = token ? buildPublicShareUrl(token) : "";
  const enabled = isShareEnabled(profile);
  const title = profile.public_card_title || profile.display_name || profile.username || "";
  const bio = profile.public_card_bio || "";
  const mode = getShareLibraryMode(profile);
  const nfcSupported = browserSupportsWebNfc();
  const shouldShowIphoneHelp = !nfcSupported || isLikelyIphone();

  setCheckedIfPresent("share-modal-public-enabled", enabled);
  setValueIfPresent("share-modal-card-title", title);
  setValueIfPresent("share-modal-card-bio", bio);
  setValueIfPresent("share-modal-library-mode", mode);
  setValueIfPresent("share-modal-link-input", url);
  populateShareQr("share-modal-qr-box", "share-modal-qr-image", url);

  setCheckedIfPresent("share-public-enabled-toggle", enabled);
  setValueIfPresent("share-card-title", title);
  setValueIfPresent("share-card-bio", bio);
  setValueIfPresent("share-library-mode", mode);
  setValueIfPresent("public-share-link-input", url);
  setValueIfPresent("owner-share-link-input", url);
  populateShareQr("public-share-qr-box", "public-share-qr-image", url);

  const modalNfcBtn = document.getElementById("share-modal-write-nfc-btn");
  const ownerNfcBtn = document.getElementById("owner-write-nfc-btn");
  const modalNfcNote = document.getElementById("share-modal-nfc-note");
  const ownerNfcNote = document.getElementById("share-nfc-support-note");

  [modalNfcBtn, ownerNfcBtn].forEach((button) => {
    if(!button) return;
    button.classList.toggle("hidden", !nfcSupported);
    button.textContent = t().share.writeNfc;
  });

  [modalNfcNote, ownerNfcNote].forEach((note) => {
    if(!note) return;
    note.classList.remove("hidden");
    note.textContent = nfcSupported ? t().share.nfcReady : t().share.nfcNotSupported;
  });

  [document.getElementById("iphone-help-card"), document.getElementById("share-modal-iphone-help-card")].forEach((card) => {
    if(!card) return;
    card.classList.toggle("hidden", !shouldShowIphoneHelp);
  });
}

function openShareModal(){
  const modal = document.getElementById("share-modal");
  if(modal){
    modal.classList.remove("hidden");
  }
}

function closeShareModal(){
  const modal = document.getElementById("share-modal");
  if(modal){
    modal.classList.add("hidden");
  }
}

async function shareLibrary(){
  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return;
  }

  const profile = await ensureCurrentProfileData();
  if(!profile?.public_share_token){
    alert(t().share.unavailable);
    return;
  }

  applyShareSettingsToOwnerPanels(currentProfileData || profile || {});
  openShareModal();
}

async function copyTextValue(value){
  if(!value) return;
  try {
    await navigator.clipboard.writeText(value);
    alert(`${t().share.linkCopied}
${value}`);
  } catch (_error) {
    prompt(t().share.linkCopied, value);
  }
}

async function copyPublicShareLinkFromModal(){
  const value = document.getElementById("share-modal-link-input")?.value || "";
  await copyTextValue(value);
}

async function copyCurrentPublicShareLink(){
  const value = document.getElementById("public-share-link-input")?.value
    || document.getElementById("owner-share-link-input")?.value
    || document.getElementById("share-modal-link-input")?.value
    || "";
  await copyTextValue(value);
}

function toggleShareModalQr(){
  const box = document.getElementById("share-modal-qr-box");
  const button = document.getElementById("share-modal-qr-btn");
  if(!box || !button) return;
  const nextHidden = !box.classList.contains("hidden");
  box.classList.toggle("hidden", nextHidden);
  button.textContent = nextHidden ? t().share.showQr : t().share.hideQr;
}

function togglePublicShareQr(){
  const box = document.getElementById("public-share-qr-box");
  if(!box) return;
  const nextHidden = !box.classList.contains("hidden");
  box.classList.toggle("hidden", nextHidden);
  syncPublicQrButtons();
}

async function savePublicShareSettingsFromInputs(prefix = "share-modal"){
  const enabled = document.getElementById(`${prefix}-public-enabled`)?.checked
    ?? document.getElementById("share-public-enabled-toggle")?.checked
    ?? true;
  const title = normalizeSpaces(document.getElementById(`${prefix}-card-title`)?.value || document.getElementById("share-card-title")?.value || "");
  const bio = normalizeSpaces(document.getElementById(`${prefix}-card-bio`)?.value || document.getElementById("share-card-bio")?.value || "");
  const mode = document.getElementById(`${prefix}-library-mode`)?.value || document.getElementById("share-library-mode")?.value || "preview";

  const profile = await upsertCurrentProfilePatch({
    public_share_enabled: Boolean(enabled),
    is_public: Boolean(enabled),
    public_card_title: title || null,
    public_card_bio: bio || null,
    public_library_mode: mode,
    public_share_token: currentProfileData?.public_share_token || ""
  });

  if(!profile) return null;

  applyShareSettingsToOwnerPanels(profile);
  if(currentPublicProfile && currentPublicProfile.id === profile.id){
    currentPublicProfile = { ...currentPublicProfile, ...profile };
    renderPublicShareProfile(currentPublicProfile);
  }
  alert(t().share.settingsSaved);
  return profile;
}

async function savePublicShareSettingsFromModal(){
  const profile = await savePublicShareSettingsFromInputs("share-modal");
  if(profile){
    closeShareModal();
  }
}

async function savePublicShareSettings(){
  await savePublicShareSettingsFromInputs("share");
}

async function regeneratePublicShareToken(){
  try {
    let nfcTag = await regenerateCurrentUserNfcTag();
    if(!nfcTag){
      const token = await regenerateProfileShareTokenRpc();
      nfcTag = { id: null, token };
    }
    const refreshedProfile = await ensureCurrentProfileData();
    const profile = {
      ...(refreshedProfile || currentProfileData || {}),
      nfc_tag_id: nfcTag?.id || refreshedProfile?.nfc_tag_id || currentProfileData?.nfc_tag_id || null,
      nfc_token: nfcTag?.token || refreshedProfile?.nfc_token || currentProfileData?.nfc_token || ""
    };

    currentProfileData = profile;
    applyShareSettingsToOwnerPanels(profile);
    if(currentPublicProfile && currentPublicProfile.id === profile.id){
      currentPublicProfile = { ...currentPublicProfile, ...profile };
      renderPublicShareProfile(currentPublicProfile);
    }
    alert(t().share.tokenRegenerated);
  } catch (error) {
    alert(error.message || String(error));
  }
}

async function regeneratePublicShareTokenFromModal(){
  await regeneratePublicShareToken();
}

async function writePublicLinkToNfcFromModal(){
  const value = document.getElementById("share-modal-link-input")?.value || "";
  await writeUrlToNfc(value);
}

async function writePublicLinkToNfc(){
  const value = document.getElementById("public-share-link-input")?.value || "";
  await writeUrlToNfc(value);
}

async function writeUrlToNfc(url){
  if(!browserSupportsWebNfc()){
    alert(t().share.nfcNotSupported);
    return;
  }
  if(!url){
    alert(t().share.unavailable);
    return;
  }

  try {
    alert(t().share.nfcPrompt);
    if(typeof window.NDEFWriter !== "undefined"){
      const writer = new window.NDEFWriter();
      await writer.write({ records: [{ recordType: "url", data: url }] });
    } else {
      const writer = new window.NDEFReader();
      await writer.write({ records: [{ recordType: "url", data: url }] });
    }
    alert(t().share.nfcSuccess);
  } catch (error) {
    console.error("Web NFC write error:", error);
    alert(`${t().share.nfcError}: ${error.message || error}`);
  }
}

function openCurrentPublicCard(){
  const url = document.getElementById("share-modal-link-input")?.value || "";
  if(!url) return;
  window.open(url, "_blank", "noopener");
}

function exitPublicShareRoute(){
  window.location.href = window.location.origin + "/";
}

async function fetchPublicLibraryItems(userId){
  const { data, error } = await supabaseClient
    .from("user_media")
    .select("*")
    .eq("user_id", userId)
    .order("id", { ascending: false });

  if(error){
    console.error(error);
    throw error;
  }

  return data || [];
}

function applyPublicLibraryItems(data = []){
  ensurePublicProfileCollectionsReset();
  currentPublicLibraryMeta = { categories: [], folders: [], statuses: [] };
  const seen = new Set();
  const categories = new Set();
  const folders = new Set();
  const statuses = new Set();

  data.forEach((item) => {
    const dedupeKey = item.canonical_key || item.work_key || (item.title || "").trim().toLowerCase();
    const fullKey = `${item.category}:${dedupeKey}`;
    if(seen.has(fullKey)){
      return;
    }
    seen.add(fullKey);

    if(!demoData[item.category]){
      demoData[item.category] = [];
    }

    if(item.category) categories.add(translateCategory(item.category));
    if(item.folder_name || item.folder) folders.add(item.folder_name || item.folder);
    if(item.status) statuses.add(translateStatus(item.status));

    demoData[item.category].push({
      id: item.id,
      title: item.title,
      status: item.status || "Planned",
      cover: item.cover_url || "",
      description: item.description || "",
      description_ru: item.description_ru || "",
      description_en: item.description_en || "",
      creator: item.creator || "",
      work_key: item.work_key || "",
      canonical_key: item.canonical_key || "",
      folder: item.folder_name || item.folder || ""
    });
  });

  currentPublicLibraryMeta = {
    categories: Array.from(categories),
    folders: Array.from(folders),
    statuses: Array.from(statuses)
  };
}

function collectPublicPreviewItems(limit = 8){
  const orderedCategories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
  const items = [];
  orderedCategories.forEach((category) => {
    (demoData[category] || []).forEach((item) => {
      items.push({ ...item, category });
    });
  });
  return items.slice(0, limit);
}

function getDefaultPublicCategory(){
  const orderedCategories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
  return orderedCategories.find((category) => (demoData[category] || []).length > 0) || "Books";
}

    function showPublicLibraryCategoryView(profile = {}){
      isPublicView = true;
      currentPublicProfile = profile;
      currentPublicProfileName = profile.display_name || profile.username || getShareCardTitle(profile) || "Library";
      currentCategory = getDefaultPublicCategory();
      resetShelfSearchQuery();

  hideAllScreens();
  document.getElementById("category-screen").classList.remove("hidden");

  const addBtn = document.getElementById("add-new-btn");
  const addFolderBtn = document.getElementById("add-folder-btn");
  if(addBtn){
    addBtn.classList.add("hidden");
    addBtn.style.display = "none";
  }
  if(addFolderBtn){
    addFolderBtn.classList.add("hidden");
    addFolderBtn.style.display = "none";
  }

  const tabs = document.getElementById("public-category-tabs");
  if(tabs){
    tabs.classList.remove("hidden");
    tabs.style.display = "flex";
  }

  document.getElementById("category-title").textContent =
    currentPublicProfileName + " — " + translateCategory(currentCategory);

  renderShelf();
}

async function openOwnerLibraryFromNfc(profile = {}, token = ""){
  activeShareToken = "";
  currentNfcContext = {
    token: token || "",
    ownerId: profile.id || null,
    mode: "owner",
    tagId: profile.nfc_tag_id || null
  };
  currentPublicProfile = { ...profile, isOwner: true };
  currentProfileData = { ...(currentProfileData || {}), ...profile };
  isPublicView = false;
  window.history.replaceState({}, "", "/");
  await showAuthorizedUI();
}

function renderPublicPreviewGrid(profile = {}){
  const container = document.getElementById("public-share-preview-grid");
  if(!container) return;

  const limit = getShareLibraryMode(profile) === "full" ? 12 : 6;
  const items = collectPublicPreviewItems(limit);
  if(items.length === 0){
    container.innerHTML = `<div class="small">${escapeHtml(t().share.noPreview)}</div>`;
    return;
  }

  container.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "media-card";
    card.addEventListener("click", () => {
      openPublicCategory(item.category, currentPublicProfileName);
      openCardById(item.id);
    });
    card.innerHTML = `
      <div class="media-card-top">
        <div class="media-cover">
          ${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">` : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`}
        </div>
      </div>
      <div class="media-info">
        <h3 class="media-title">${escapeHtml(item.title)}</h3>
        <div class="media-meta">${escapeHtml(translateCategory(item.category))}</div>
        <div class="media-status">${escapeHtml(translateStatus(item.status || t().labels.unknownStatus))}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function syncPublicQrButtons(){
  const qrBox = document.getElementById("public-share-qr-box");
  const qrVisible = Boolean(qrBox && !qrBox.classList.contains("hidden"));
  const publicQrBtn = document.getElementById("public-share-qr-btn");
  const ownerQrBtn = document.getElementById("owner-show-qr-btn");
  const qrLabel = qrVisible ? t().share.hideQr : t().share.showQr;

  if(publicQrBtn){
    publicQrBtn.setAttribute("title", qrLabel);
    publicQrBtn.setAttribute("aria-label", qrLabel);
  }

  if(ownerQrBtn){
    ownerQrBtn.textContent = qrLabel;
  }
}

function setPublicLibraryExpanded(expanded = false, options = {}){
  publicLibraryExpanded = Boolean(expanded);
  const section = document.getElementById("public-share-library-section");
  if(!section) return;

  const shouldShowSection = publicLibraryExpanded && currentPublicShareState !== "error";
  section.classList.toggle("hidden", !shouldShowSection);

  if(shouldShowSection && options.scroll !== false){
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderOwnerPanel(profile = {}){
  const ownerControls = document.getElementById("public-share-owner-controls");
  if(!ownerControls) return;

  const isOwner = Boolean(profile.isOwner);
  ownerControls.classList.toggle("hidden", !isOwner);
  if(!isOwner) return;

  applyShareSettingsToOwnerPanels(profile);
}

function renderPublicCard(profile = {}){
  currentPublicProfile = profile;
  activeShareToken = profile.nfc_token || profile.public_share_token || activeShareToken;
  currentPublicProfileName = profile.display_name || profile.username || getShareCardTitle(profile) || "Library";

  const loadingCard = document.getElementById("public-share-loading-card");
  const mainCard = document.getElementById("public-share-main-card");
  const errorCard = document.getElementById("public-share-error-card");
  if(loadingCard) loadingCard.classList.add("hidden");
  if(mainCard) mainCard.classList.remove("hidden");
  if(errorCard) errorCard.classList.add("hidden");

  setTextIfPresent("public-share-display-name", getShareCardTitle(profile) || "My Plamut");
  setTextIfPresent("public-share-username", profile.username ? `@${profile.username}` : "@plamut");
  setTextIfPresent("public-share-bio", getShareCardBio(profile) || t().share.libraryHint);
  setTextIfPresent("public-share-badge", profile.isOwner ? t().share.ownerBadge : t().share.guestBadge);

  const avatarImg = document.getElementById("public-share-avatar-img");
  const avatarFallback = document.getElementById("public-share-avatar-fallback");
  const hasAvatar = Boolean(profile.avatar_url);
  if(avatarImg){
    avatarImg.src = hasAvatar ? profile.avatar_url : "";
    avatarImg.classList.toggle("hidden", !hasAvatar);
  }
  if(avatarFallback){
    avatarFallback.textContent = getProfileInitials(profile.display_name || getShareCardTitle(profile), profile.username || "P");
    avatarFallback.classList.toggle("hidden", hasAvatar);
  }

  const link = buildPublicShareUrl(profile.nfc_token || profile.public_share_token || "");
  setValueIfPresent("public-share-link-input", link);
  setValueIfPresent("owner-share-link-input", link);
  populateShareQr("public-share-qr-box", "public-share-qr-image", link);

  const publicCopyBtn = document.getElementById("public-share-copy-btn");
  if(publicCopyBtn){
    publicCopyBtn.setAttribute("title", t().share.copyLink);
    publicCopyBtn.setAttribute("aria-label", t().share.copyLink);
  }

  renderPublicLibraryMeta();
  syncPublicQrButtons();
  updatePublicSaveButton();
  renderOwnerPanel(profile);
}

function renderPublicShareProfile(profile = {}){
  renderPublicCard(profile);
}

async function showPublicShareScreen(profile){
  isPublicView = true;
  renderPublicShareProfile(profile);
  hideAllScreens();
  document.getElementById("public-share-screen").classList.remove("hidden");
}

async function loadPublicShareRoute(token){
  activeShareToken = token || "";
  currentNfcContext = null;
  currentPublicProfile = null;
  currentPublicShareItems = [];
  currentPublicShareState = "loading";
  publicLibraryExpanded = false;

  setPublicRouteMode(true);
  hideAllScreens();
  document.getElementById("public-share-screen")?.classList.remove("hidden");
  renderShareState("loading");

  try {
    const profile = await fetchPublicProfileByToken(token);
    if(!profile || !isShareEnabled(profile)){
      currentPublicProfile = null;
      renderShareState("error");
      return true;
    }

    const user = await getCurrentUser();
    const isOwner = Boolean(user && user.id === profile.id);
    currentPublicProfile = { ...profile, isOwner, public_share_token: token };
    renderPublicShareProfile(currentPublicProfile);

    const items = await fetchPublicShareLibraryItems(profile.id);
    if(!isOwner){
      await getSavedLibraryState(profile.id, token);
      updatePublicSaveButton();
    }
    renderShareLibrary(items);
    return true;
  } catch (error) {
    console.error("Public share page init error:", error);
    currentPublicProfile = null;
    renderShareState("error");
    return true;
  }
}

async function loadNfcRoute(token){
  activeShareToken = token || "";
  currentPublicProfile = null;
  currentPublicShareItems = [];
  currentPublicShareState = "loading";
  publicLibraryExpanded = true;
  currentSavedLibraryState = { saved: false, source: "none" };

  setPublicRouteMode(true);
  hideAllScreens();
  document.getElementById("public-share-screen")?.classList.remove("hidden");
  renderShareState("loading");

  try {
    let tag = await fetchNfcTagByToken(token);
    let profile = null;

    if(!tag){
      profile = await fetchPublicProfileByToken(token);
      if(profile){
        tag = {
          id: null,
          user_id: profile.id,
          token,
          is_active: true
        };
      }
    }

    if(!tag){
      currentPublicProfile = null;
      renderShareState("error");
      return true;
    }

    const user = await getCurrentUser();
    profile = profile || await fetchProfileByUserId(tag.user_id);
    if(user && user.id === tag.user_id){
      const ownerProfile = {
        ...(profile || {}),
        id: tag.user_id,
        nfc_tag_id: tag.id,
        nfc_token: tag.token,
        public_share_token: profile?.public_share_token || ""
      };
      await openOwnerLibraryFromNfc(ownerProfile, tag.token);
      return true;
    }

    if(!profile || !isShareEnabled(profile)){
      currentPublicProfile = null;
      renderShareState("error");
      return true;
    }

    currentNfcContext = {
      token: tag.token,
      ownerId: tag.user_id,
      mode: "guest",
      tagId: tag.id
    };
    currentPublicProfile = {
      ...profile,
      isOwner: false,
      nfc_tag_id: tag.id,
      nfc_token: tag.token
    };

    const items = await fetchPublicShareLibraryItems(profile.id);
    applyPublicLibraryItems(items);
    await getSavedLibraryState(profile.id, tag.token);
    renderPublicShareProfile(currentPublicProfile);
    renderShareLibrary(items);
    return true;
  } catch (error) {
    console.error("NFC page init error:", error);
    currentPublicProfile = null;
    renderShareState("error");
    return true;
  }
}

function renderShareState(state = "loading"){
  currentPublicShareState = state;
  const loadingCard = document.getElementById("public-share-loading-card");
  const mainCard = document.getElementById("public-share-main-card");
  const errorCard = document.getElementById("public-share-error-card");
  const ownerControls = document.getElementById("public-share-owner-controls");
  const loading = document.getElementById("public-share-loading");
  const empty = document.getElementById("public-share-empty");
  const grid = document.getElementById("public-share-preview-grid");

  if(loadingCard) loadingCard.classList.toggle("hidden", state !== "loading");
  if(errorCard) errorCard.classList.toggle("hidden", state !== "error");
  if(mainCard) mainCard.classList.toggle("hidden", state === "loading" || state === "error" || !currentPublicProfile);
  if(ownerControls && (state === "loading" || state === "error" || !currentPublicProfile)){
    ownerControls.classList.add("hidden");
  }

  const showLibrarySection = publicLibraryExpanded && state !== "error";
  setPublicLibraryExpanded(showLibrarySection, { scroll: false });

  if(loading) loading.classList.toggle("hidden", !(showLibrarySection && state === "loading"));
  if(empty) empty.classList.toggle("hidden", !(showLibrarySection && state === "empty"));
  if(grid) grid.classList.toggle("hidden", !(showLibrarySection && state === "ready"));
}

function buildShareMetaRow(label, value){
  if(!value) return "";
  return `
    <div class="share-item-meta-row">
      <div class="share-item-meta-label">${escapeHtml(label)}</div>
      <div>${escapeHtml(value)}</div>
    </div>
  `;
}

function openShareItemModal(item = {}){
  const modal = document.getElementById("share-item-modal");
  if(!modal) return;

  const coverBox = document.getElementById("share-item-modal-cover");
  const title = document.getElementById("share-item-modal-title");
  const original = document.getElementById("share-item-modal-original");
  const badges = document.getElementById("share-item-modal-badges");
  const meta = document.getElementById("share-item-modal-meta");
  const description = document.getElementById("share-item-modal-description");

  if(title) title.textContent = item.title || "";
  if(coverBox){
    coverBox.innerHTML = item.cover
      ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title || t().labels.cover)}">`
      : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;
  }

  if(original){
    const originalTitle = item.original_title || item.originalTitle || "";
    original.textContent = originalTitle;
    original.classList.toggle("hidden", !originalTitle);
  }

  if(badges){
    const chips = [
      item.category ? `<span class="badge">${escapeHtml(translateCategory(item.category))}</span>` : "",
      item.status ? `<span class="badge">${escapeHtml(translateStatus(item.status))}</span>` : ""
    ].filter(Boolean).join("");
    badges.innerHTML = chips;
  }

  if(meta){
    meta.innerHTML = [
      buildShareMetaRow(t().share.type, item.category ? translateCategory(item.category) : ""),
      buildShareMetaRow(t().labels.statusLabel, item.status ? translateStatus(item.status) : ""),
      buildShareMetaRow(t().labels.folder, item.folder || item.folder_name || ""),
      buildShareMetaRow(t().share.year, item.year || item.release_year || ""),
      buildShareMetaRow(t().share.rating, item.rating || item.score || ""),
      buildShareMetaRow(t().labels.creator, item.creator || "")
    ].join("");
  }

  if(description){
      const finalDescription = item.description || item.description_ru || item.description_original || item.description_en || "";
    description.textContent = finalDescription;
    description.classList.toggle("hidden", !finalDescription);
  }

  modal.classList.remove("hidden");
}

function closeShareItemModal(){
  document.getElementById("share-item-modal")?.classList.add("hidden");
}

function renderShareItemCard(item = {}){
  const card = document.createElement("button");
  card.type = "button";
  card.className = "media-card";
  card.addEventListener("click", () => openShareItemModal(item));
  card.innerHTML = `
    <div class="media-card-top">
      <div class="media-cover">
        ${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title || t().labels.cover)}">` : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`}
      </div>
    </div>
    <div class="media-info">
      <h3 class="media-title">${escapeHtml(item.title || "")}</h3>
      <div class="media-meta">${escapeHtml(item.category ? translateCategory(item.category) : "")}</div>
      <div class="media-status">${escapeHtml(item.status ? translateStatus(item.status) : t().labels.unknownStatus)}</div>
    </div>
  `;
  return card;
}

function renderShareLibrary(items = []){
  const grid = document.getElementById("public-share-preview-grid");
  if(!grid) return;

  currentPublicShareItems = Array.isArray(items) ? items.map((item) => ({
    ...item,
    cover: item.cover || item.cover_url || ""
  })) : [];
  applyPublicLibraryItems(currentPublicShareItems);
  applyTranslations();
  renderPublicLibraryMeta();

  if(currentPublicShareItems.length === 0){
    grid.innerHTML = "";
    renderShareState("empty");
    return;
  }

  grid.innerHTML = "";
  currentPublicShareItems.forEach((item) => {
    grid.appendChild(renderShareItemCard(item));
  });
  renderShareState("ready");
}

async function initPublicSharePage(){
  const token = decodeURIComponent(window.location.pathname.replace(/^\/(?:share|nfc)\//, "").trim());
  if(!token){
    return false;
  }

  return isNfcRoute() ? loadNfcRoute(token) : loadPublicShareRoute(token);
}

function openSharedLibrary(){
  if(document.body.classList.contains("public-route-active")){
    if(currentPublicProfile && !currentPublicProfile.isOwner){
      showPublicLibraryCategoryView(currentPublicProfile);
      return;
    }
    setPublicLibraryExpanded(true);
    renderShareState(currentPublicShareItems.length ? "ready" : currentPublicShareState === "loading" ? "loading" : "empty");
    return;
  }

  if(!currentPublicProfile){
    return;
  }
  openPublicCategory(getDefaultPublicCategory(), currentPublicProfileName);
}

async function changePassword(){
  const newPassword = document.getElementById("new-password")?.value || "";
  const confirmPassword = document.getElementById("confirm-password")?.value || "";

  if(!newPassword.trim()){
    alert(t().profile.passwordRequired);
    return;
  }

  if(newPassword.length < 6){
    alert(t().profile.passwordTooShort);
    return;
  }

  if(newPassword !== confirmPassword){
    alert(t().profile.passwordMismatch);
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if(error){
    alert(error.message);
    return;
  }

  document.getElementById("new-password").value = "";
  document.getElementById("confirm-password").value = "";
  document.getElementById("profile-show-password").checked = false;
  togglePasswordVisibility();
  alert(t().profile.passwordSaved);
}

    async function saveProfile(){
  const username = document.getElementById("profile-username").value.trim();
  const displayName = document.getElementById("profile-display-name").value.trim();
  const isPublic = document.getElementById("profile-public").checked;

  const profile = await upsertCurrentProfilePatch({
    username: username || null,
    display_name: displayName || null,
    public_share_enabled: isPublic,
    is_public: isPublic,
    public_share_token: currentProfileData?.public_share_token || "",
    public_card_title: currentProfileData?.public_card_title || null,
    public_card_bio: currentProfileData?.public_card_bio || null,
    public_library_mode: currentProfileData?.public_library_mode || "preview"
  });

  if(!profile){
    return;
  }

  await loadProfile();
  closeProfileModal();
  alert(t().profile.saved);
}

    async function loadProfile(){
  const usernameInput = document.getElementById("profile-username");
  const displayNameInput = document.getElementById("profile-display-name");
  const publicInput = document.getElementById("profile-public");

  const resetProfileFields = () => {
    currentProfileData = null;
    if(usernameInput) usernameInput.value = "";
    if(displayNameInput) displayNameInput.value = "";
    if(publicInput) publicInput.checked = true;
    const displayName = document.getElementById("profile-display-name")?.value || "";
    const username = document.getElementById("profile-username")?.value || "";
    setAvatarPreview("", displayName, username);
  };

  try {
    const user = await getCurrentUser();
    if(!user){
      resetProfileFields();
      return;
    }

    const data = await ensureCurrentProfileData();
    if(!data){
      resetProfileFields();
      return;
    }

    if(usernameInput) usernameInput.value = data.username || "";
    if(displayNameInput) displayNameInput.value = data.display_name || "";
    if(publicInput) publicInput.checked = isShareEnabled(data);

    setAvatarPreview(data.avatar_url || "", data.display_name || "", data.username || "");
    applyShareSettingsToOwnerPanels(data);
  } catch (error) {
    console.error("Load profile error:", error);
    resetProfileFields();
  }
}

    function openPublicCategory(name, profileName = "Library"){
      closePreferencesPanel();
      if(!isPublicView){
        return;
      }

      currentCategory = name;
      resetShelfSearchQuery();

      hideAllScreens();
      document.getElementById("category-screen").classList.remove("hidden");

      const addBtn = document.getElementById("add-new-btn");
      const addFolderBtn = document.getElementById("add-folder-btn");
      if(addBtn){
        addBtn.classList.add("hidden");
        addBtn.style.display = "none";
      }
      if(addFolderBtn){
        addFolderBtn.classList.add("hidden");
        addFolderBtn.style.display = "none";
      }

      const tabs = document.getElementById("public-category-tabs");
      if(tabs){
        tabs.classList.remove("hidden");
        tabs.style.display = "flex";
      }

      document.getElementById("category-title").textContent =
        profileName + " — " + translateCategory(name);

      renderShelf();
    }

    async function loadPublicLibrary(username){
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if(profileError){
        console.error(profileError);
        alert(t().labels.profileLookupError);
        return false;
      }

      if(!profile){
        alert(t().labels.userNotFound);
        return false;
      }

      if(!isShareEnabled(profile)){
        alert(t().labels.libraryPrivate);
        return false;
      }

      const items = await fetchPublicLibraryItems(profile.id);
      applyPublicLibraryItems(items);
      isPublicView = true;
      currentPublicProfile = profile;
      currentPublicProfileName = profile.display_name || profile.username || getShareCardTitle(profile) || "Library";

      hideAllScreens();
      document.getElementById("category-screen").classList.remove("hidden");

      const addBtn = document.getElementById("add-new-btn");
      const addFolderBtn = document.getElementById("add-folder-btn");
      if(addBtn){
        addBtn.classList.add("hidden");
        addBtn.style.display = "none";
      }
      if(addFolderBtn){
        addFolderBtn.classList.add("hidden");
        addFolderBtn.style.display = "none";
      }

      const tabs = document.getElementById("public-category-tabs");
      if(tabs){
        tabs.classList.remove("hidden");
        tabs.style.display = "flex";
      }

      currentCategory = "Books";
      document.getElementById("category-title").textContent =
        currentPublicProfileName + " — " + translateCategory("Books");

      renderShelf();
      return true;
    }

    async function checkPublicRoute(){
      const path = window.location.pathname;

      if(path.startsWith("/nfc/")){
        const token = decodeURIComponent(path.replace("/nfc/", "").trim());
        if(token){
          return await loadNfcRoute(token);
        }
      }

      if(path.startsWith("/share/")){
        const token = decodeURIComponent(path.replace("/share/", "").trim());
        if(token){
          return await loadPublicShareRoute(token);
        }
      }

      if(path.startsWith("/u/")){
        const username = decodeURIComponent(path.replace("/u/", "").trim());
        if(username){
          return await loadPublicLibrary(username);
        }
      }

      activeShareToken = "";
      return false;
    }

async function uploadAvatar(){

  const fileInput = document.getElementById("avatar-file");
  const file = fileInput?.files?.[0];

  if(!file){
    alert(t().profile.avatarSelectFirst);
    return;
  }

  const user = await getCurrentUser();
  if(!user) return;

  const thumbnailBlob = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if(!ctx){
          reject(new Error("Canvas is not supported"));
          return;
        }

        const sourceSize = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - sourceSize) / 2);
        const sy = Math.max(0, (img.height - sourceSize) / 2);
        ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
        canvas.toBlob((blob) => {
          if(!blob){
            reject(new Error("Could not create avatar thumbnail"));
            return;
          }
          resolve(blob);
        }, "image/jpeg", 0.9);
      };
      img.onerror = () => reject(new Error("Could not read selected image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
  });

  const fileName = `${user.id}.jpg`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("avatars")
    .upload(fileName, thumbnailBlob, {
      upsert:true,
      contentType:"image/jpeg"
    });

  if(uploadError){
    alert(uploadError.message);
    return;
  }

  const { data } = supabaseClient
    .storage
    .from("avatars")
    .getPublicUrl(fileName);

  const avatarUrl = data.publicUrl;

  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      id: user.id,
      avatar_url: avatarUrl
    });

  if(error){
    alert(error.message);
    return;
  }

  const displayName = document.getElementById("profile-display-name")?.value || "";
  const username = document.getElementById("profile-username")?.value || "";
  setAvatarPreview(avatarUrl, displayName, username);
  if(currentProfileData){
    currentProfileData.avatar_url = avatarUrl;
    applyShareSettingsToOwnerPanels(currentProfileData);
  }
  if(currentPublicProfile?.isOwner){
    currentPublicProfile.avatar_url = avatarUrl;
    renderPublicShareProfile(currentPublicProfile);
  }
  if(fileInput) fileInput.value = "";
  alert(t().profile.avatarUpdated);

}

async function removeAvatar(){

  const user = await getCurrentUser();
  if(!user) return;

  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      id: user.id,
      avatar_url: null
    });

  if(error){
    alert(error.message);
    return;
  }

  const displayName = document.getElementById("profile-display-name")?.value || "";
  const username = document.getElementById("profile-username")?.value || "";
  setAvatarPreview("", displayName, username);
  if(currentProfileData){
    currentProfileData.avatar_url = "";
    applyShareSettingsToOwnerPanels(currentProfileData);
  }
  if(currentPublicProfile?.isOwner){
    currentPublicProfile.avatar_url = "";
    renderPublicShareProfile(currentPublicProfile);
  }
  const fileInput = document.getElementById("avatar-file");
  if(fileInput) fileInput.value = "";
  alert(t().profile.avatarRemoved);

}

    function showRuntimeError(message){
      const banner = document.getElementById("runtime-error-banner");
      if(!banner) return;

      const details = String(message || "Unknown error");
      banner.textContent = `${t().labels.runtimeError} ${details}`;
      banner.classList.remove("hidden");
    }

    async function initApp(){
      setPublicRouteMode(false);

      supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        const loginBtn = document.getElementById("login-top-btn");
        const profileBtn = document.getElementById("profile-btn");

        if(activeShareToken){
          setAuthorizedButtons(Boolean(session?.user));
          if(session?.user){
            await ensureCurrentProfileData();
          }
          if(isNfcRoute()){
            await loadNfcRoute(activeShareToken);
          } else {
            await loadPublicShareRoute(activeShareToken);
          }
          return;
        }

        if(session?.user){
          await showAuthorizedUI();
        } else {
          closePreferencesPanel();
          hideAllScreens();
          document.getElementById("auth-screen").classList.remove("hidden");
          setAuthorizedButtons(false);

          if(loginBtn) loginBtn.classList.remove("hidden");
          if(profileBtn) profileBtn.classList.add("hidden");
        }
      });

      const openedPublic = await checkPublicRoute();
      if(!openedPublic){
        await checkAuth();
      }
    }

    async function init(){
      applyThemeMode();
      applyTranslations();
      updateHeaderCompactState();

      systemThemeMedia.addEventListener("change", () => {
        if(currentThemeMode === "system"){
          applyThemeMode();
        }
      });

      window.addEventListener("scroll", updateHeaderCompactState, { passive: true });

      document.addEventListener("click", (event) => {
        const panel = document.getElementById("preferences-panel");
        const button = document.getElementById("preferences-btn");
        if(!panel || panel.classList.contains("hidden")) return;
        if(panel.contains(event.target) || button?.contains(event.target)) return;
        closePreferencesPanel();
      });

      document.addEventListener("keydown", (event) => {
        if(event.key === "Escape"){
          closePreferencesPanel();
          closeShareItemModal();
          closeFolderModal();
        }
      });

      window.addEventListener("error", (event) => {
        showRuntimeError(event?.message || "Unknown script error");
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message = reason?.message || reason || "Unhandled promise rejection";
        showRuntimeError(message);
      });

      if(isPublicShareRoute()){
        await initPublicSharePage();
        return;
      }

      await initApp();
    }


Object.assign(translations.en.topbar, {
  nfc: "NFC"
});
Object.assign(translations.ru.topbar, {
  nfc: "NFC"
});
Object.assign(translations.en.profile, {
  nfcTitle: "NFC",
  nfcHint: "Manage the connected tag, public card link and future replacement options in a separate settings section.",
  openNfc: "Open NFC settings"
});
Object.assign(translations.ru.profile, {
  nfcTitle: "NFC",
  nfcHint: "Управление подключённой меткой, публичной ссылкой и будущей заменой вынесено в отдельный раздел настроек.",
  openNfc: "Открыть NFC"
});
Object.assign(translations.en.buttons, {
  addFab: "Add"
});
Object.assign(translations.ru.buttons, {
  addFab: "Добавить"
});
Object.assign(translations.en.share, {
  modalTitle: "NFC settings",
  modalSubtitle: "Manage the public card, QR and NFC link for your profile.",
  quickActions: "Share library"
});
Object.assign(translations.ru.share, {
  modalTitle: "NFC",
  modalSubtitle: "Управляйте публичной карточкой, QR-кодом и NFC-ссылкой для профиля.",
  quickActions: "Поделиться библиотекой"
});

const baseApplyTranslations = applyTranslations;
applyTranslations = function applyTranslationsWithRefresh(){
  baseApplyTranslations();
  setTextIfPresent("profile-menu-open-btn", t().profile.title);
  setTextIfPresent("profile-menu-nfc-btn", t().topbar.nfc);
  setTextIfPresent("profile-menu-logout-btn", t().profile.logout);
  setTextIfPresent("profile-nfc-title", t().profile.nfcTitle);
  setTextIfPresent("profile-nfc-hint", t().profile.nfcHint);
  setTextIfPresent("profile-open-nfc-btn", t().profile.openNfc);
  setTextIfPresent("share-library-btn", t().topbar.shareLibrary);
  setTextIfPresent("share-library-copy-action", t().share.copyLink);
  setTextIfPresent("share-library-qr-action", t().share.showQr);
  setTextIfPresent("share-library-open-action", t().share.openPublicCard);
  setTextIfPresent("global-add-fab-label", t().buttons.addFab);
  updatePrimaryActionVisibility();
  syncHeaderProfileIdentity();
};

const baseSetAvatarPreview = setAvatarPreview;
setAvatarPreview = function setAvatarPreviewWithHeader(url, displayName = "", username = ""){
  baseSetAvatarPreview(url, displayName, username);
  const extraImgs = [document.getElementById("header-popover-avatar-img")];
  const extraFallbacks = [document.getElementById("header-popover-avatar-fallback")];
  const initials = getProfileInitials(displayName, username);
  const hasUrl = Boolean(url && String(url).trim());

  extraFallbacks.forEach((node) => {
    if(node){
      node.textContent = initials;
      node.classList.toggle("hidden", hasUrl);
    }
  });

  extraImgs.forEach((img) => {
    if(!img) return;
    if(hasUrl){
      img.src = url;
      img.classList.remove("hidden");
    } else {
      img.src = "";
      img.classList.add("hidden");
    }
  });

  syncHeaderProfileIdentity(displayName, username);
};

function getCurrentShareUrl(){
  return document.getElementById("share-modal-link-input")?.value || buildPublicShareUrl(currentProfileData?.nfc_token || currentProfileData?.public_share_token || "");
}

function syncHeaderProfileIdentity(displayName = "", username = ""){
  const profile = currentProfileData || {};
  const resolvedName = normalizeSpaces(displayName || profile.display_name || profile.public_card_title || profile.username || "Plamut");
  const resolvedUsername = normalizeSpaces(username || profile.username || "");
  const nameNode = document.getElementById("header-popover-name");
  const handleNode = document.getElementById("header-popover-handle");
  if(nameNode) nameNode.textContent = resolvedName || "Plamut";
  if(handleNode) handleNode.textContent = resolvedUsername ? `@${resolvedUsername}` : t().brand.subtitle;
}

function toggleProfileMenu(force){
  const menu = document.getElementById("profile-menu");
  const button = document.getElementById("profile-btn");
  if(!menu || !button) return;
  const shouldOpen = typeof force === "boolean" ? force : menu.classList.contains("hidden");
  closeShareMenu();
  menu.classList.toggle("hidden", !shouldOpen);
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function closeProfileMenu(){
  toggleProfileMenu(false);
}

function toggleShareMenu(force){
  const menu = document.getElementById("share-library-menu");
  const button = document.getElementById("share-library-btn");
  if(!menu || !button) return;
  const shouldOpen = typeof force === "boolean" ? force : menu.classList.contains("hidden");
  closeProfileMenu();
  menu.classList.toggle("hidden", !shouldOpen);
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function closeShareMenu(){
  const menu = document.getElementById("share-library-menu");
  const button = document.getElementById("share-library-btn");
  if(menu) menu.classList.add("hidden");
  if(button) button.setAttribute("aria-expanded", "false");
  const qrBox = document.getElementById("share-library-menu-qr-box");
  if(qrBox) qrBox.classList.add("hidden");
  setTextIfPresent("share-library-qr-action", t().share.showQr);
}

function closePreferencesPanel(){
  closeProfileMenu();
  closeShareMenu();
}

function openProfileFromMenu(){
  closeProfileMenu();
  openProfileModal();
}

async function openNfcSettingsModal(){
  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return;
  }
  closePreferencesPanel();
  const profile = await ensureCurrentProfileData();
  if(!profile?.public_share_token){
    alert(t().share.unavailable);
    return;
  }
  applyShareSettingsToOwnerPanels(currentProfileData || profile || {});
  openShareModal();
}

function openNfcSettingsFromMenu(){
  closeProfileMenu();
  openNfcSettingsModal();
}

function openCurrentPublicCardFromMenu(){
  closeShareMenu();
  openCurrentPublicCard();
}

async function copyPublicShareLinkFromMenu(){
  await copyTextValue(getCurrentShareUrl());
  closeShareMenu();
}

function toggleShareMenuQr(){
  const box = document.getElementById("share-library-menu-qr-box");
  if(!box) return;
  const shouldOpen = box.classList.contains("hidden");
  if(shouldOpen){
    const url = getCurrentShareUrl();
    populateShareQr("share-library-menu-qr-box", "share-library-menu-qr-image", url);
  }
  box.classList.toggle("hidden", !shouldOpen);
  setTextIfPresent("share-library-qr-action", shouldOpen ? t().share.hideQr : t().share.showQr);
}

function handlePrimaryAddAction(){
  if(document.getElementById("home-screen") && !document.getElementById("home-screen").classList.contains("hidden")){
    toggleHomeAddPanel();
    return;
  }
  if(document.getElementById("library-screen") && !document.getElementById("library-screen").classList.contains("hidden")){
    openAddModal();
    return;
  }
  if(document.getElementById("category-screen") && !document.getElementById("category-screen").classList.contains("hidden") && !isPublicView && currentCategory !== "Blacklist"){
    openAddModal();
  }
}

function updatePrimaryActionVisibility(){
  const fab = document.getElementById("global-add-fab");
  if(!fab) return;
  const isAuthorized = Boolean(document.getElementById("header-profile-menu-wrap") && !document.getElementById("header-profile-menu-wrap").classList.contains("hidden"));
  const homeVisible = !document.getElementById("home-screen")?.classList.contains("hidden");
  const libraryVisible = !document.getElementById("library-screen")?.classList.contains("hidden");
  const categoryVisible = !document.getElementById("category-screen")?.classList.contains("hidden");
  const detailsVisible = !document.getElementById("details-screen")?.classList.contains("hidden");
  const authVisible = !document.getElementById("auth-screen")?.classList.contains("hidden");
  const canShow = isAuthorized && !isPublicView && !detailsVisible && !authVisible && (homeVisible || libraryVisible || (categoryVisible && currentCategory !== "Blacklist"));
  fab.classList.toggle("hidden", !canShow);
}

function setAuthorizedButtons(isAuthorized){
  const loginBtn = document.getElementById("login-top-btn");
  const profileWrap = document.getElementById("header-profile-menu-wrap");

  if(loginBtn){
    loginBtn.classList.toggle("hidden", isAuthorized);
  }

  if(profileWrap){
    profileWrap.classList.toggle("hidden", !isAuthorized);
  }

  if(!isAuthorized){
    setAvatarPreview("", "", "");
    currentProfileData = null;
    closePreferencesPanel();
  }

  updatePrimaryActionVisibility();
}

function applyShareSettingsToOwnerPanels(profile = {}){
  const token = profile.nfc_token || profile.public_share_token || "";
  const url = token ? buildPublicShareUrl(token) : "";
  const enabled = isShareEnabled(profile);
  const title = profile.public_card_title || profile.display_name || profile.username || "";
  const bio = profile.public_card_bio || "";
  const mode = getShareLibraryMode(profile);
  const nfcSupported = browserSupportsWebNfc();
  const shouldShowIphoneHelp = !nfcSupported || isLikelyIphone();

  setCheckedIfPresent("share-modal-public-enabled", enabled);
  setValueIfPresent("share-modal-card-title", title);
  setValueIfPresent("share-modal-card-bio", bio);
  setValueIfPresent("share-modal-library-mode", mode);
  setValueIfPresent("share-modal-link-input", url);
  populateShareQr("share-modal-qr-box", "share-modal-qr-image", url);
  populateShareQr("share-library-menu-qr-box", "share-library-menu-qr-image", url);

  setCheckedIfPresent("share-public-enabled-toggle", enabled);
  setValueIfPresent("share-card-title", title);
  setValueIfPresent("share-card-bio", bio);
  setValueIfPresent("share-library-mode", mode);
  setValueIfPresent("public-share-link-input", url);
  setValueIfPresent("owner-share-link-input", url);
  populateShareQr("public-share-qr-box", "public-share-qr-image", url);

  const modalNfcBtn = document.getElementById("share-modal-write-nfc-btn");
  const ownerNfcBtn = document.getElementById("owner-write-nfc-btn");
  const modalNfcNote = document.getElementById("share-modal-nfc-note");
  const ownerNfcNote = document.getElementById("share-nfc-support-note");
  const shareBtn = document.getElementById("share-library-btn");

  [modalNfcBtn, ownerNfcBtn].forEach((button) => {
    if(!button) return;
    button.classList.toggle("hidden", !nfcSupported);
    button.textContent = t().share.writeNfc;
  });

  [modalNfcNote, ownerNfcNote].forEach((note) => {
    if(!note) return;
    note.classList.remove("hidden");
    note.textContent = nfcSupported ? t().share.nfcReady : t().share.nfcNotSupported;
  });

  [document.getElementById("iphone-help-card"), document.getElementById("share-modal-iphone-help-card")].forEach((card) => {
    if(!card) return;
    card.classList.toggle("hidden", !shouldShowIphoneHelp);
  });

  if(shareBtn){
    shareBtn.disabled = !url;
  }
}

async function shareLibrary(){
  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return;
  }

  const profile = await ensureCurrentProfileData();
  if(!profile?.public_share_token){
    alert(t().share.unavailable);
    return;
  }

  applyShareSettingsToOwnerPanels(currentProfileData || profile || {});
  toggleShareMenu();
}

function renderShelf(){
  const shelf = document.getElementById("shelf");
  if(!shelf) return;

  closeCardMenu();
  shelf.innerHTML = "";
  syncShelfSearchInput();

  const filterToolbar = document.getElementById("filter-toolbar");
  const statusFilterWrap = document.getElementById("status-filter-wrap");
  if(filterToolbar){
    filterToolbar.classList.toggle("hidden", currentCategory === "Blacklist");
  }
  if(statusFilterWrap){
    statusFilterWrap.classList.toggle("hidden", currentCategory === "Blacklist");
  }

  const items = getFilteredItems();
  if(items.length === 0){
    shelf.innerHTML = `<div class="small">${escapeHtml(t().labels.noResults)}</div>`;
    return;
  }

  const buildChip = (label, type = "") => label ? `<span class="meta-chip ${type}">${escapeHtml(label)}</span>` : "";
  const createCard = (item) => {
    const coverHtml = item.cover
      ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">`
      : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;
    const creatorLine = item.creator ? `<div class="media-meta">${escapeHtml(item.creator)}</div>` : "";
    const chips = [
      buildChip(item.folder || "", "is-folder"),
      buildChip(translateStatus(item.status || t().labels.unknownStatus), "is-status"),
      buildChip(translateCategory(currentCategory), "is-category")
    ].join("");
    const menuHtml = isPublicView
      ? ""
      : `<div class="media-menu-wrap" onclick="event.stopPropagation()">
           <button class="media-menu-btn" type="button" aria-label="${escapeHtml(t().buttons.moreActions)}" aria-haspopup="true" aria-expanded="false" onclick="toggleCardMenu(event, ${item.id})">⋮</button>
           <div class="media-menu" role="menu">
             <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); openFolderPickerById(${item.id})">${escapeHtml(t().buttons.addToFolder)}</button>
             <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); changeStatusById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.changeStatus)}</button>
             <button class="media-menu-item media-menu-item-danger" type="button" role="menuitem" onclick="event.stopPropagation(); deleteItemById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.delete)}</button>
           </div>
         </div>`;

    const card = document.createElement("article");
    card.className = "media-card";
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <div class="media-card-top">
        <button class="media-cover-button" type="button" aria-label="${escapeHtml(item.title || t().buttons.open)}" onclick="event.stopPropagation(); openCardById(${item.id})">
          <div class="media-cover">${coverHtml}</div>
        </button>
        ${menuHtml}
      </div>
      <div class="media-info">
        <div class="media-meta-chips">${chips}</div>
        <h3 class="media-title">${escapeHtml(item.title)}</h3>
        ${creatorLine}
      </div>
    `;
    return card;
  };

  const folders = [];
  const ungroupedItems = [];
  const grouped = new Map();

  items.forEach((item) => {
    const folder = getItemFolder(item);
    if(!folder){
      ungroupedItems.push(item);
      return;
    }
    if(!grouped.has(folder)){
      grouped.set(folder, []);
      folders.push(folder);
    }
    grouped.get(folder).push(item);
  });

  if(ungroupedItems.length){
    const defaultGrid = document.createElement("div");
    defaultGrid.className = "shelf";
    ungroupedItems.forEach((item) => defaultGrid.appendChild(createCard(item)));
    shelf.appendChild(defaultGrid);
  }

  folders.forEach((folder) => {
    const section = document.createElement("section");
    section.className = "folder-block";
    section.innerHTML = `<h3 class="folder-block-title"><span>${escapeHtml(folder)}</span><span class="small">${grouped.get(folder).length}</span></h3>`;
    const folderGrid = document.createElement("div");
    folderGrid.className = "shelf";
    grouped.get(folder).forEach((item) => folderGrid.appendChild(createCard(item)));
    section.appendChild(folderGrid);
    shelf.appendChild(section);
  });
}

function goHome(){
  closePreferencesPanel();
  resetShelfSearchQuery();
  toggleHomeAddPanel(false);
  if(activeShareToken && currentPublicProfile && !currentPublicProfile.isOwner){
    if(document.body.classList.contains("public-route-active")){
      showPublicShareScreen(currentPublicProfile);
      renderShareState(currentPublicShareItems.length ? "ready" : currentPublicShareState);
    } else {
      showPublicLibraryCategoryView(currentPublicProfile);
    }
    updatePrimaryActionVisibility();
    return;
  }
  isPublicView = false;
  hideAllScreens();
  document.getElementById("home-screen").classList.remove("hidden");
  toggleCategoryFilters(false);
  updatePrimaryActionVisibility();
}

async function openLibraryScreen(){
  closePreferencesPanel();
  toggleHomeAddPanel(false);
  isPublicView = false;
  hideAllScreens();
  document.getElementById("library-screen")?.classList.remove("hidden");
  await renderLibraryCategories();
  updatePrimaryActionVisibility();
}

async function ensureLibraryDataLoaded(){
  const categories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
  for(const category of categories){
    if(!(demoData[category] || []).length){
      await loadCategoryFromSupabase(category);
    }
  }
}

async function renderLibraryCategories(){
  const grid = document.getElementById("library-categories-grid");
  if(!grid) return;
  await ensureLibraryDataLoaded();
  const query = normalizeComparisonText(document.getElementById("library-search-input")?.value || "");
  const categories = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
  grid.innerHTML = "";

  categories.forEach((category) => {
    const items = demoData[category] || [];
    const count = query
      ? items.filter((item) => normalizeComparisonText(item.title || "").includes(query)).length
      : items.length;
    if(query && count === 0) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card category-card library-category-card";
    card.onclick = () => openCategory(category);
    card.innerHTML = `<span>${escapeHtml(translateCategory(category))}</span><span class="small">${count}</span>`;
    grid.appendChild(card);
  });
}

function toggleCategoryFilters(force){
  const panel = document.getElementById("filter-toolbar");
  if(!panel || currentCategory === "Blacklist") return;
  const shouldOpen = typeof force === "boolean" ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !shouldOpen);
}

function backToCategory(){
  closePreferencesPanel();
  syncShelfSearchInput();
  hideAllScreens();
  document.getElementById("category-screen").classList.remove("hidden");
  updatePrimaryActionVisibility();
}

async function openCategory(name){
  closePreferencesPanel();
  isPublicView = false;
  currentCategory = name;
  resetShelfSearchQuery();

  hideAllScreens();
  document.getElementById("category-screen").classList.remove("hidden");
  document.getElementById("category-title").textContent = translateCategory(name);
  document.getElementById("back-home-btn").onclick = openLibraryScreen;
  toggleCategoryFilters(false);

  const addFolderBtn = document.getElementById("add-folder-btn");
  if(addFolderBtn){
    addFolderBtn.classList.toggle("hidden", name === "Blacklist");
    addFolderBtn.style.display = name === "Blacklist" ? "none" : "";
  }

  const tabs = document.getElementById("public-category-tabs");
  if(tabs){
    tabs.classList.add("hidden");
    tabs.style.display = "none";
  }

  await loadCategoryFromSupabase(name);
  updatePrimaryActionVisibility();
}

async function openCardById(id){
  closeCardMenu();
  closePreferencesPanel();
  currentOpenItemId = id;
  const item = getItemById(currentCategory, id);

  hideAllScreens();
  document.getElementById("details-screen").classList.remove("hidden");

  document.getElementById("details-title").textContent = item?.title || "";
  document.getElementById("details-creator").textContent = item?.creator || "";
  document.getElementById("details-category").textContent = translateCategory(currentCategory);
  document.getElementById("details-status").textContent = item ? translateStatus(item.status) : t().labels.unknownStatus;
  document.getElementById("details-folder-badge").textContent = item?.folder || t().labels.noFolder;

  const coverBox = document.getElementById("details-cover-box");
  if(item && item.cover){
    coverBox.innerHTML = `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">`;
  } else {
    coverBox.textContent = t().labels.cover;
  }

  const descriptionEl = document.getElementById("details-description");
  if(!item){
    descriptionEl.textContent = t().labels.noDescription;
  } else {
    descriptionEl.textContent = t().labels.searching;
    await ensureItemDescriptions(item);
    const bestDescription = pickBestDescription(item, currentLanguage);
    descriptionEl.textContent = bestDescription || t().labels.noDescription;
  }

  const canonicalSection = document.getElementById("canonical-key-section");
  const canonicalInput = document.getElementById("canonical-key-input");
  const folderSection = document.getElementById("details-folder-section");
  const folderCurrent = document.getElementById("details-folder-current");
  const folderButton = document.getElementById("open-folder-modal-btn");

  if(canonicalInput && canonicalSection){
    canonicalSection.classList.add("hidden");
    canonicalInput.value = item?.canonical_key || "";
  }

  if(folderSection && folderCurrent && folderButton){
    if(isPublicView){
      folderSection.classList.add("hidden");
    } else {
      folderSection.classList.remove("hidden");
      folderCurrent.textContent = item?.folder || t().labels.noFolder;
      folderButton.disabled = !item;
    }
  }

  const statusBtn = document.getElementById("change-status-details-btn");
  const deleteBtn = document.getElementById("delete-details-btn");
  if(statusBtn) statusBtn.classList.toggle("hidden", isPublicView);
  if(deleteBtn) deleteBtn.classList.toggle("hidden", isPublicView);

  deferRelatedItemsRender(item, currentCategory);
  updatePrimaryActionVisibility();
}

async function showAuthorizedUI(){
  closePreferencesPanel();
  setPublicRouteMode(false);
  hideAllScreens();
  document.getElementById("home-screen").classList.remove("hidden");
  setAuthorizedButtons(true);
  refreshAccountCollectionsUI();
  safeLoadProfile("showAuthorizedUI");
  updatePrimaryActionVisibility();
}

function showAuthScreen(){
  closePreferencesPanel();
  hideAllScreens();
  document.getElementById("auth-screen").classList.remove("hidden");
  updatePrimaryActionVisibility();
}

async function logout(){
  closePreferencesPanel();
  closeProfileModal();
  closeShareModal();
  await supabaseClient.auth.signOut();
  location.reload();
}

function openProfileModal(){
  const modal = document.getElementById("profile-modal");
  closePreferencesPanel();
  resetProfileSecurityFields();
  if(modal) modal.classList.remove("hidden");
  refreshAccountCollectionsUI();
  safeLoadProfile("openProfileModal");
}

function toggleHomeAddPanel(force){
  const panel = document.getElementById("home-add-panel");
  if(!panel) return;
  const shouldOpen = typeof force === "boolean" ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !shouldOpen);
}

function updateHeaderCompactState(){
  document.body.classList.toggle("header-compact", window.scrollY > 8);
}

async function init(){
  applyThemeMode();
  applyTranslations();
  updateHeaderCompactState();

  systemThemeMedia.addEventListener("change", () => {
    if(currentThemeMode === "system"){
      applyThemeMode();
    }
  });

  window.addEventListener("scroll", updateHeaderCompactState, { passive: true });

  document.addEventListener("click", (event) => {
    const profileMenu = document.getElementById("profile-menu");
    const profileButton = document.getElementById("profile-btn");
    if(profileMenu && !profileMenu.classList.contains("hidden") && !profileMenu.contains(event.target) && !profileButton?.contains(event.target)){
      closeProfileMenu();
    }

    const shareMenu = document.getElementById("share-library-menu");
    const shareButton = document.getElementById("share-library-btn");
    if(shareMenu && !shareMenu.classList.contains("hidden") && !shareMenu.contains(event.target) && !shareButton?.contains(event.target)){
      closeShareMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape"){
      closePreferencesPanel();
      closeShareItemModal();
      closeFolderModal();
      toggleHomeAddPanel(false);
    }
  });

  window.addEventListener("error", (event) => {
    showRuntimeError(event?.message || "Unknown script error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message = reason?.message || reason || "Unhandled promise rejection";
    showRuntimeError(message);
  });

  if(isPublicShareRoute()){
    await initPublicSharePage();
    updatePrimaryActionVisibility();
    return;
  }

  await initApp();
  updatePrimaryActionVisibility();
}


let currentFilterFolder = localStorage.getItem("plamut_folder_filter") || "All";
let currentItemActionSheetId = null;

Object.assign(translations.en.profile, {
  folderManagerTitle: "Folders",
  folderManagerHint: "Create, rename and delete folders inside the current category.",
  createFolder: "Create folder",
  renameFolder: "Rename",
  deleteFolder: "Delete"
});
Object.assign(translations.ru.profile, {
  folderManagerTitle: "Папки",
  folderManagerHint: "Создавайте, переименовывайте и удаляйте папки внутри текущей категории.",
  createFolder: "Создать папку",
  renameFolder: "Переименовать",
  deleteFolder: "Удалить"
});
Object.assign(translations.en.buttons, {
  cancelShort: "Cancel",
  removeFromFolder: "Remove from folder",
  moveToFolder: "Move to folder",
  manageFolders: "Manage folders"
});
Object.assign(translations.ru.buttons, {
  cancelShort: "Отмена",
  removeFromFolder: "Убрать из папки",
  moveToFolder: "Переместить в папку",
  manageFolders: "Папки"
});
Object.assign(translations.en.labels, {
  foldersEmpty: "No folders yet",
  foldersManage: "Folders",
  allItems: "All items",
  ungroupedItems: "Without folder"
});
Object.assign(translations.ru.labels, {
  foldersEmpty: "Папок пока нет",
  foldersManage: "Папки",
  allItems: "Все элементы",
  ungroupedItems: "Без папки"
});

function isMobileViewport(){
  return window.matchMedia("(max-width: 720px)").matches;
}

function setBodySheetLock(locked){
  document.body.classList.toggle("sheet-open", Boolean(locked));
}

function getAnySheetOpen(){
  return ["share-sheet", "folder-manager-sheet", "item-actions-sheet", "folder-modal"].some((id) => !document.getElementById(id)?.classList.contains("hidden"));
}

function syncBodySheetLock(){
  setBodySheetLock(getAnySheetOpen());
}

function closeShareSheet(){
  const sheet = document.getElementById("share-sheet");
  if(sheet) sheet.classList.add("hidden");
  const qr = document.getElementById("share-sheet-qr-box");
  if(qr) qr.classList.add("hidden");
  setTextIfPresent("share-sheet-qr-btn", t().share.showQr);
  syncBodySheetLock();
}

function closeShareSheetOnBackdrop(event){
  if(event?.target?.id === "share-sheet" || event?.target?.classList?.contains("sheet-backdrop")){
    closeShareSheet();
  }
}

function openShareSheet(){
  const sheet = document.getElementById("share-sheet");
  if(!sheet) return;
  closeItemActionsSheet();
  closeFolderManagerSheet();
  sheet.classList.remove("hidden");
  syncBodySheetLock();
}

function toggleShareSheetQr(){
  const box = document.getElementById("share-sheet-qr-box");
  if(!box) return;
  const shouldOpen = box.classList.contains("hidden");
  if(shouldOpen){
    populateShareQr("share-sheet-qr-box", "share-sheet-qr-image", getCurrentShareUrl());
  }
  box.classList.toggle("hidden", !shouldOpen);
  setTextIfPresent("share-sheet-qr-btn", shouldOpen ? t().share.hideQr : t().share.showQr);
}

async function copyPublicShareLinkFromSheet(){
  await copyTextValue(getCurrentShareUrl());
  closeShareSheet();
}

function openCurrentPublicCardFromSheet(){
  closeShareSheet();
  openCurrentPublicCard();
}

async function shareLibrary(){
  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return;
  }
  const profile = await ensureCurrentProfileData();
  if(!profile?.public_share_token){
    alert(t().share.unavailable);
    return;
  }
  applyShareSettingsToOwnerPanels(currentProfileData || profile || {});
  openShareSheet();
}

function closeItemActionsSheet(){
  const sheet = document.getElementById("item-actions-sheet");
  if(sheet) sheet.classList.add("hidden");
  currentItemActionSheetId = null;
  syncBodySheetLock();
}

function closeItemActionsSheetOnBackdrop(event){
  if(event?.target?.id === "item-actions-sheet" || event?.target?.classList?.contains("sheet-backdrop")){
    closeItemActionsSheet();
  }
}

async function removeItemFromFolderById(id){
  const item = getItemById(currentCategory, id);
  if(!item) return;
  pendingFolderSelection = "";
  currentFolderModalItemId = id;
  await saveItemFolderFromModal();
  closeItemActionsSheet();
}

function buildItemActions(item){
  if(!item) return [];
  return [
    {
      label: item.folder ? t().buttons.moveToFolder : t().buttons.addToFolder,
      variant: "secondary",
      handler: async () => {
        closeItemActionsSheet();
        await openFolderModalById(item.id);
      }
    },
    ...(item.folder ? [{
      label: t().buttons.removeFromFolder,
      variant: "secondary",
      handler: async () => {
        await removeItemFromFolderById(item.id);
      }
    }] : []),
    {
      label: t().buttons.changeStatus,
      variant: "secondary",
      handler: () => {
        closeItemActionsSheet();
        changeStatusById(item.id);
      }
    },
    {
      label: t().buttons.delete,
      variant: "danger",
      handler: async () => {
        closeItemActionsSheet();
        await deleteItemById(item.id);
      }
    }
  ];
}

function openItemActionsSheet(id){
  const item = getItemById(currentCategory, id);
  if(!item) return;
  const list = document.getElementById("item-actions-list");
  if(!list) return;
  currentItemActionSheetId = id;
  setTextIfPresent("item-actions-title", item.title || t().buttons.moreActions);
  setTextIfPresent("item-actions-subtitle", item.folder ? `${t().labels.folder}: ${item.folder}` : translateCategory(currentCategory));
  list.innerHTML = "";
  buildItemActions(item).forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${action.variant === "danger" ? "button-danger" : "button-secondary"}`;
    button.textContent = action.label;
    button.addEventListener("click", () => action.handler());
    list.appendChild(button);
  });
  document.getElementById("item-actions-sheet")?.classList.remove("hidden");
  syncBodySheetLock();
}

function toggleCardMenu(event, id){
  if(isPublicView){
    if(event){ event.preventDefault(); event.stopPropagation(); }
    return;
  }
  if(event){
    event.preventDefault();
    event.stopPropagation();
  }
  if(isMobileViewport()){
    openItemActionsSheet(id);
    return;
  }
  const nextId = currentOpenMenuItemId === id ? null : id;
  closeCardMenu();
  currentOpenMenuItemId = nextId;
  if(nextId === null) return;
  const card = document.querySelector(`.media-card[data-item-id="${id}"]`);
  const button = card?.querySelector(".media-menu-btn");
  if(card) card.classList.add("menu-open");
  if(button) button.setAttribute("aria-expanded", "true");
}

async function getFolderUsageMap(){
  const usage = new Map();
  (demoData[currentCategory] || []).forEach((item) => {
    const key = normalizeSpaces(item.folder || "");
    if(!key) return;
    usage.set(key, (usage.get(key) || 0) + 1);
  });
  return usage;
}

async function renameCustomFolder(oldFolder, nextFolder){
  const oldName = normalizeSpaces(oldFolder);
  const newName = normalizeSpaces(nextFolder);
  if(!oldName || !newName || oldName === newName) return;

  const folders = await getCustomFolders();
  if(folders.includes(newName)){
    alert(t().profile.customFolderExists);
    return;
  }

  await setCustomFolders(folders.map((folder) => folder === oldName ? newName : folder));

  const assignments = await getFolderAssignments();
  Object.keys(assignments).forEach((key) => {
    if(assignments[key] === oldName) assignments[key] = newName;
  });
  await setFolderAssignments(assignments);

  for(const category of Object.keys(demoData)){
    demoData[category].forEach((item) => {
      if(item.folder === oldName) item.folder = newName;
    });
  }

  const user = await getCurrentUser();
  if(user){
    const { error } = await supabaseClient
      .from("user_media")
      .update({ folder_name: newName })
      .eq("user_id", user.id)
      .eq("folder_name", oldName);
    if(error){
      console.error("Folder rename update error:", error);
    }
  }

  if(currentFilterFolder === oldName){
    currentFilterFolder = newName;
    localStorage.setItem("plamut_folder_filter", currentFilterFolder);
  }

  renderFolderRail();
  renderFolderManagerList();
  renderShelf();
}

async function removeCustomFolder(folder){
  const folderName = normalizeSpaces(folder);
  if(!folderName) return;
  const folders = await getCustomFolders();
  await setCustomFolders(folders.filter((item) => item !== folderName));

  const assignments = await getFolderAssignments();
  Object.keys(assignments).forEach((key) => {
    if(assignments[key] === folderName){
      assignments[key] = "";
    }
  });
  await setFolderAssignments(assignments);

  for(const category of Object.keys(demoData)){
    demoData[category].forEach((item) => {
      if(item.folder === folderName){
        item.folder = "";
      }
    });
  }

  const user = await getCurrentUser();
  if(user){
    const { error } = await supabaseClient
      .from("user_media")
      .update({ folder_name: null })
      .eq("user_id", user.id)
      .eq("folder_name", folderName);
    if(error){
      console.error("Folder delete update error:", error);
    }
  }

  if(currentFilterFolder === folderName){
    currentFilterFolder = "All";
    localStorage.setItem("plamut_folder_filter", currentFilterFolder);
  }

  renderFolderRail();
  renderFolderManagerList();
  renderShelf();
}

function setFolderFilter(value){
  currentFilterFolder = value || "All";
  localStorage.setItem("plamut_folder_filter", currentFilterFolder);
  renderFolderRail();
  renderShelf();
}

async function renderFolderRail(){
  const rail = document.getElementById("folder-rail");
  if(!rail) return;
  if(isPublicView || currentCategory === "Blacklist"){
    rail.classList.add("hidden");
    rail.innerHTML = "";
    return;
  }

  const folders = await getAvailableFolders();
  const usage = await getFolderUsageMap();
  const allCount = (demoData[currentCategory] || []).length;
  const ungroupedCount = (demoData[currentCategory] || []).filter((item) => !normalizeSpaces(item.folder || "")).length;

  rail.classList.remove("hidden");
  rail.innerHTML = "";

  const buttons = [
    { label: `${t().labels.allItems} · ${allCount}`, value: "All" },
    ...folders.map((folder) => ({ label: `${folder} · ${usage.get(folder) || 0}`, value: folder })),
    ...(ungroupedCount ? [{ label: `${t().labels.ungroupedItems} · ${ungroupedCount}`, value: "__ungrouped__" }] : [])
  ];

  buttons.forEach(({ label, value }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `folder-chip${currentFilterFolder === value ? " is-active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => setFolderFilter(value));
    rail.appendChild(button);
  });

  const manageButton = document.createElement("button");
  manageButton.type = "button";
  manageButton.className = "folder-manage-chip";
  manageButton.textContent = t().buttons.manageFolders;
  manageButton.addEventListener("click", openFolderManagerSheet);
  rail.appendChild(manageButton);
}

async function renderFolderManagerList(){
  const list = document.getElementById("folder-manager-list");
  if(!list) return;
  const folders = await getAvailableFolders();
  const usage = await getFolderUsageMap();
  list.innerHTML = "";
  if(!folders.length){
    list.innerHTML = `<div class="small">${escapeHtml(t().labels.foldersEmpty)}</div>`;
    return;
  }

  folders.forEach((folder) => {
    const row = document.createElement("div");
    row.className = "folder-manager-row";
    row.innerHTML = `
      <div class="folder-manager-row-main">
        <div class="folder-manager-row-title">${escapeHtml(folder)}</div>
        <div class="folder-manager-row-meta">${escapeHtml(String(usage.get(folder) || 0))} · ${escapeHtml(translateCategory(currentCategory || ""))}</div>
      </div>
    `;

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "button button-secondary";
    renameBtn.textContent = t().profile.renameFolder;
    renameBtn.addEventListener("click", async () => {
      const nextName = normalizeSpaces(prompt(t().profile.renameFolder, folder));
      if(!nextName || nextName === folder) return;
      await renameCustomFolder(folder, nextName);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "button button-danger";
    deleteBtn.textContent = t().profile.deleteFolder;
    deleteBtn.addEventListener("click", async () => {
      const confirmed = confirm(`${t().profile.deleteFolder}: ${folder}?`);
      if(!confirmed) return;
      await removeCustomFolder(folder);
    });

    row.appendChild(renameBtn);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  });
}

function openFolderManagerSheet(){
  if(!isOwnerControlAllowed()) return;
  closeShareSheet();
  closeItemActionsSheet();
  document.getElementById("folder-manager-sheet")?.classList.remove("hidden");
  renderFolderManagerList();
  syncBodySheetLock();
}

function closeFolderManagerSheet(){
  document.getElementById("folder-manager-sheet")?.classList.add("hidden");
  const input = document.getElementById("folder-manager-input");
  if(input) input.value = "";
  syncBodySheetLock();
}

function closeFolderManagerSheetOnBackdrop(event){
  if(event?.target?.id === "folder-manager-sheet" || event?.target?.classList?.contains("sheet-backdrop")){
    closeFolderManagerSheet();
  }
}

async function createFolderFromSheet(){
  if(!isOwnerControlAllowed()) return;
  const input = document.getElementById("folder-manager-input");
  const value = normalizeSpaces(input?.value || "");
  if(!value){
    alert(t().profile.customValueRequired);
    return;
  }
  const folders = await getCustomFolders();
  if(folders.includes(value)){
    alert(t().profile.customFolderExists);
    return;
  }
  folders.push(value);
  await setCustomFolders(folders);
  if(input) input.value = "";
  renderFolderRail();
  renderFolderManagerList();
}

function addCustomFolder(){
  openFolderManagerSheet();
}

async function openFolderModalById(id){
  if(!isOwnerControlAllowed()) return;
  closeItemActionsSheet();
  const item = getItemById(currentCategory, id);
  if(!item) return;
  currentFolderModalItemId = id;
  pendingFolderSelection = item.folder || "";
  await renderFolderModalOptions();
  document.getElementById("folder-modal")?.classList.remove("hidden");
  setBodySheetLock(true);
}

function closeFolderModal(){
  document.getElementById("folder-modal")?.classList.add("hidden");
  currentFolderModalItemId = null;
  pendingFolderSelection = "";
  syncBodySheetLock();
}

async function renderFolderModalOptions(){
  const list = document.getElementById("folder-modal-list");
  if(!list) return;
  const folders = await getAvailableFolders();
  const options = ["", ...folders];
  list.innerHTML = "";
  options.forEach((folder) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-option" + (pendingFolderSelection === folder ? " is-active" : "");
    button.innerHTML = `
      <span>${escapeHtml(folder || t().labels.noFolder)}</span>
      <span class="small">${pendingFolderSelection === folder ? "✓" : ""}</span>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      pendingFolderSelection = folder;
      renderFolderModalOptions();
    });
    list.appendChild(button);
  });
}

function closeFolderModalOnBackdrop(event){
  if(event?.target?.id === "folder-modal"){
    closeFolderModal();
  }
}

function getFilteredItems(){
  const items = demoData[currentCategory] || [];
  const searchComparison = normalizeComparisonText(currentShelfSearchQuery);
  return items.filter((item) => {
    const statusMatches = currentCategory === "Blacklist" || currentFilterStatus === "All" || item.status === currentFilterStatus;
    const folderMatches = currentFilterFolder === "All"
      || (currentFilterFolder === "__ungrouped__" ? !normalizeSpaces(item.folder || "") : normalizeSpaces(item.folder || "") === currentFilterFolder);
    const haystack = normalizeComparisonText([item.title, item.creator, item.description_ru, item.description_original, item.description_en].filter(Boolean).join(" "));
    const searchMatches = !searchComparison || haystack.includes(searchComparison);
    return statusMatches && folderMatches && searchMatches;
  });
}

function renderShelf(){
  const shelf = document.getElementById("shelf");
  if(!shelf) return;
  closeCardMenu();
  shelf.innerHTML = "";
  syncShelfSearchInput();
  renderFolderRail();

  const filterToolbar = document.getElementById("filter-toolbar");
  const statusFilterWrap = document.getElementById("status-filter-wrap");
  if(filterToolbar) filterToolbar.classList.toggle("hidden", currentCategory === "Blacklist");
  if(statusFilterWrap) statusFilterWrap.classList.toggle("hidden", currentCategory === "Blacklist");

  const items = getFilteredItems();
  if(items.length === 0){
    shelf.innerHTML = `<div class="small">${escapeHtml(t().labels.noResults)}</div>`;
    return;
  }

  const buildChip = (label, type = "") => label ? `<span class="meta-chip ${type}">${escapeHtml(label)}</span>` : "";
  const isUserCreatedItem = (item) => String(item?.canonical_key || "").includes("-manual-");
  const createCard = (item) => {
    const coverHtml = item.cover
      ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">`
      : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;
    const creatorLine = item.creator ? `<div class="media-meta">${escapeHtml(item.creator)}</div>` : "";
    const chips = [
      buildChip(translateStatus(item.status || t().labels.unknownStatus), "is-status"),
      buildChip(translateCategory(currentCategory), "is-category"),
      buildChip(item.folder || "", "is-folder"),
      isUserCreatedItem(item) ? buildChip(currentLanguage === "ru" ? "Пользовательское" : "Custom", "is-custom") : ""
    ].join("");
    const menuHtml = isPublicView ? "" : `<div class="media-menu-wrap" onclick="event.stopPropagation()">
      <button class="media-menu-btn" type="button" aria-label="${escapeHtml(t().buttons.moreActions)}" aria-haspopup="true" aria-expanded="false" onclick="toggleCardMenu(event, ${item.id})">⋮</button>
      <div class="media-menu" role="menu">
        <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); openFolderPickerById(${item.id})">${escapeHtml(item.folder ? t().buttons.moveToFolder : t().buttons.addToFolder)}</button>
        ${item.folder ? `<button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); removeItemFromFolderById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.removeFromFolder)}</button>` : ""}
        <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); changeStatusById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.changeStatus)}</button>
        <button class="media-menu-item media-menu-item-danger" type="button" role="menuitem" onclick="event.stopPropagation(); deleteItemById(${item.id}); closeCardMenu()">${escapeHtml(t().buttons.delete)}</button>
      </div>
    </div>`;
    const card = document.createElement("article");
    card.className = "media-card";
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <div class="media-card-top">
        <button class="media-cover-button" type="button" aria-label="${escapeHtml(item.title || t().buttons.open)}" onclick="event.stopPropagation(); openCardById(${item.id})">
          <div class="media-cover">${coverHtml}</div>
        </button>
        ${menuHtml}
      </div>
      <div class="media-info">
        <div class="media-meta-chips">${chips}</div>
        <h3 class="media-title">${escapeHtml(item.title)}</h3>
        ${creatorLine}
      </div>`;
    return card;
  };

  const sortedItems = [...items].sort((a, b) => (b.id || 0) - (a.id || 0));
  const grid = document.createElement("div");
  grid.className = "shelf";
  sortedItems.forEach((item) => grid.appendChild(createCard(item)));
  shelf.appendChild(grid);
}

const mobileRefineApplyTranslations = applyTranslations;
applyTranslations = function applyTranslationsMobileRefine(){
  mobileRefineApplyTranslations();
  setTextIfPresent("home-open-library-btn", currentLanguage === "ru" ? "Библиотека" : "Library");
  setTextIfPresent("library-screen-title", t().home.libraryTitle);
  setTextIfPresent("back-library-home-btn", t().buttons.backHome);
  setTextIfPresent("filter-toggle-btn", currentLanguage === "ru" ? "Фильтр" : "Filter");
  const librarySearchInput = document.getElementById("library-search-input");
  if(librarySearchInput) librarySearchInput.placeholder = t().modals.searchPlaceholder;
  setTextIfPresent("share-sheet-title", t().topbar.shareLibrary);
  setTextIfPresent("share-sheet-subtitle", t().share.libraryHint);
  setTextIfPresent("share-sheet-copy-btn", t().share.copyLink);
  setTextIfPresent("share-sheet-qr-btn", t().share.showQr);
  setTextIfPresent("share-sheet-open-btn", t().share.openPublicCard);
  setTextIfPresent("share-sheet-cancel-btn", t().buttons.cancel);
  setTextIfPresent("folder-manager-title", t().profile.folderManagerTitle);
  setTextIfPresent("folder-manager-subtitle", t().profile.folderManagerHint);
  const folderInput = document.getElementById("folder-manager-input");
  if(folderInput) folderInput.placeholder = t().profile.customFolderLabel;
  setTextIfPresent("folder-manager-create-btn", t().profile.createFolder);
  setTextIfPresent("folder-manager-cancel-btn", t().buttons.cancel);
  setTextIfPresent("item-actions-cancel-btn", t().buttons.cancel);
  renderLibraryCategories();
  renderFolderRail();
  renderFolderManagerList();
};

const previousRefreshAccountCollectionsUI = refreshAccountCollectionsUI;
refreshAccountCollectionsUI = function refreshAccountCollectionsUIWithFolders(){
  previousRefreshAccountCollectionsUI();
  renderFolderRail();
  renderFolderManagerList();
};

function closePreferencesPanel(){
  closeProfileMenu();
  closeShareMenu();
  closeShareSheet();
  closeFolderManagerSheet();
  closeItemActionsSheet();
}

function handlePrimaryAddAction(){
  if(document.getElementById("home-screen") && !document.getElementById("home-screen").classList.contains("hidden")){
    toggleHomeAddPanel();
    return;
  }
  if(document.getElementById("category-screen") && !document.getElementById("category-screen").classList.contains("hidden") && !isPublicView && currentCategory !== "Blacklist"){
    openAddModal();
  }
}

async function init(){
  applyThemeMode();
  applyTranslations();
  updateHeaderCompactState();
  systemThemeMedia.addEventListener("change", () => {
    if(currentThemeMode === "system") applyThemeMode();
  });
  window.addEventListener("scroll", updateHeaderCompactState, { passive: true });
  window.addEventListener("resize", () => {
    if(!isMobileViewport()) closeItemActionsSheet();
  });
  document.addEventListener("click", (event) => {
    const profileMenu = document.getElementById("profile-menu");
    const profileButton = document.getElementById("profile-btn");
    if(profileMenu && !profileMenu.classList.contains("hidden") && !profileMenu.contains(event.target) && !profileButton?.contains(event.target)) closeProfileMenu();
    const shareMenu = document.getElementById("share-library-menu");
    const shareButton = document.getElementById("share-library-btn");
    if(shareMenu && !shareMenu.classList.contains("hidden") && !shareMenu.contains(event.target) && !shareButton?.contains(event.target)) closeShareMenu();
  });
  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape"){
      closePreferencesPanel();
      closeShareItemModal();
      closeFolderModal();
      toggleHomeAddPanel(false);
    }
  });
  window.addEventListener("error", (event) => showRuntimeError(event?.message || "Unknown script error"));
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    showRuntimeError(reason?.message || reason || "Unhandled promise rejection");
  });
  if(isPublicShareRoute()){
    await initPublicSharePage();
    updatePrimaryActionVisibility();
    return;
  }
  await initApp();
  updatePrimaryActionVisibility();
}

    init();
