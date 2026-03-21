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
          email: "Email",
          password: "Password",
          login: "Login",
          register: "Register"
        },
        topbar: {
          profile: "Profile",
          login: "Login",
          logout: "Logout",
          shareLibrary: "Share Library"
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
        }
      },
      ru: {
        subtitle: "Персональная библиотека и трекер медиа-вселенных",
        auth: {
          loginTitle: "Вход в Plamut",
          email: "Почта",
          password: "Пароль",
          login: "Войти",
          register: "Регистрация"
        },
        topbar: {
          profile: "Профиль",
          login: "Войти",
          logout: "Выйти",
          shareLibrary: "Поделиться библиотекой"
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
        }
      }
    };

    let currentLanguage = localStorage.getItem("plamut_language") || "ru";
    let currentCategory = null;
    let currentOpenItemId = null;
    let currentStatusItemId = null;
    let currentSearchResults = [];
    let isPublicView = false;
    let currentPublicProfileName = "Library";
    let searchTimer = null;
    let currentFilterStatus = localStorage.getItem("plamut_status_filter") || "All";
    let currentOpenMenuItemId = null;

    const demoData = {
      Books: [],
      Movies: [],
      Series: [],
      Anime: [],
      Manga: [],
      Blacklist: []
    };

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
      return ["Planned", "In progress", "Done", "Dropped", ...customStatuses];
    }

    async function getAvailableFolders(){
      return await getCustomFolders();
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      localStorage.setItem("plamut_language", lang);
      document.documentElement.lang = lang;
      applyTranslations();
      rerenderCurrentScreen();
    }

    function setStatusFilter(value){
      currentFilterStatus = value || "All";
      localStorage.setItem("plamut_status_filter", currentFilterStatus);
      renderShelf();
    }

    async function renderStatusOptions(){
      const container = document.getElementById("status-buttons");
      if(!container) return;

      const statuses = await getAvailableStatuses();
      container.innerHTML = statuses
        .map((status) => `
          <button class="button" onclick="setStatus(${JSON.stringify(status)})">${escapeHtml(translateStatus(status))}</button>
        `)
        .join("");
    }

    async function renderFolderFilterOptions(){
      const detailsFolderSelect = document.getElementById("details-folder-select");
      const folders = await getAvailableFolders();

      if(detailsFolderSelect){
        detailsFolderSelect.innerHTML = [
          `<option value="">${escapeHtml(t().labels.noFolder)}</option>`,
          ...folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)
        ].join("");
      }
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

      document.getElementById("cat-books").textContent = t().categories.Books;
      document.getElementById("cat-movies").textContent = t().categories.Movies;
      document.getElementById("cat-series").textContent = t().categories.Series;
      document.getElementById("cat-anime").textContent = t().categories.Anime;
      document.getElementById("cat-manga").textContent = t().categories.Manga;
      document.getElementById("cat-blacklist").textContent = t().categories.Blacklist;

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
      document.getElementById("save-folder-btn").textContent = t().labels.saveFolder;

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
      document.getElementById("profile-btn").textContent = t().topbar.profile;
      document.getElementById("share-library-btn").textContent = t().topbar.shareLibrary;

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
      document.getElementById("category-screen").classList.add("hidden");
      document.getElementById("details-screen").classList.add("hidden");
      document.getElementById("auth-screen").classList.add("hidden");
    }

    function goHome(){
      isPublicView = false;
      hideAllScreens();
      document.getElementById("home-screen").classList.remove("hidden");
    }

    function backToCategory(){
      hideAllScreens();
      document.getElementById("category-screen").classList.remove("hidden");
    }

    function openAddModal(){
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
      hideAllScreens();
      document.getElementById("auth-screen").classList.remove("hidden");
    }

    function closeStatusModal(){
      document.getElementById("status-modal").classList.add("hidden");
    }

    function getFilteredItems(){
      const items = demoData[currentCategory] || [];
      return items.filter((item) => {
        const statusMatches = currentCategory === "Blacklist" || currentFilterStatus === "All" || item.status === currentFilterStatus;
        return statusMatches;
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
      const clean = normalizeSpaces(query);
      const list = [];
      if(clean) list.push(clean);

      try {
        if(hasCyrillic(clean)){
          const en = await translateTextToEnglish(clean);
          if(en && !list.includes(en)) list.push(en);
        } else if(hasLatin(clean)){
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
        description_en: looksLikeEnglish(description) ? description : ""
      };
    }

    function pickBestDescription(item, lang){
      if(!item) return "";
      if(lang === "ru" && item.description_ru) return item.description_ru;
      if(lang === "en" && item.description_en) return item.description_en;
      return item.description || "";
    }

    function buildCanonicalKey(category, source, rawId, title){
      if(rawId){
        return `${category}:${source}:${rawId}`;
      }
      return `${category}:${String(title || "").trim().toLowerCase()}`;
    }

    function getOpenLibraryCoverUrl(coverId){
      if(!coverId) return "";
      return "https://covers.openlibrary.org/b/id/" + coverId + "-L.jpg";
    }

    function dedupeSearchResults(items){
      const seen = new Set();
      return items.filter(item => {
        const key = item.canonical_key || item.work_key || (item.category + ":" + (item.title || "").trim().toLowerCase());
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    async function fetchOpenLibraryDescription(workKey, preferredLang = currentLanguage){
      if(!workKey) return { text: "", language: "" };

      try {
        const cleanKey = workKey.startsWith("/works/") ? workKey : `/works/${workKey}`;
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

        let query = "";
        if(title && author){
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

    async function buildBookDescriptions(title, author, workKey){
      let description = "";
      let description_ru = "";
      let description_en = "";

      const olCurrent = await fetchOpenLibraryDescription(workKey, currentLanguage);
      if(olCurrent.text){
        description = olCurrent.text;
        if(olCurrent.language === "ru") description_ru = olCurrent.text;
        if(olCurrent.language === "en") description_en = olCurrent.text;
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
          description_en = olEn.text;
          if(!description) description = olEn.text;
        }
      }

      if(!description_ru){
        const googleRu = await fetchGoogleBooksDescription(title, author, "ru");
        if(googleRu.text && looksLikeRussian(googleRu.text)){
          description_ru = googleRu.text;
          if(!description) description = googleRu.text;
        }
      }

      if(!description_en){
        const googleEn = await fetchGoogleBooksDescription(title, author, "en");
        if(googleEn.text && looksLikeEnglish(googleEn.text)){
          description_en = googleEn.text;
          if(!description) description = googleEn.text;
        }
      }

      if(!description_ru && description_en){
        const translatedRu = await translateTextToRussian(description_en);
        if(translatedRu && looksLikeRussian(translatedRu)){
          description_ru = translatedRu;
        }
      }

      if(!description_en && description_ru){
        const translatedEn = await translateTextToEnglish(description_ru);
        if(translatedEn && looksLikeEnglish(translatedEn)){
          description_en = translatedEn;
        }
      }

      if(!description){
        description = description_ru || description_en || "";
      }

      return {
        description: description || "",
        description_ru: description_ru || "",
        description_en: description_en || ""
      };
    }

    async function translateDescriptionFields(description){
      let description_ru = "";
      let description_en = "";
      if(looksLikeRussian(description)){
        description_ru = description;
        description_en = await translateTextToEnglish(description);
      } else if(looksLikeEnglish(description)){
        description_en = description;
        description_ru = await translateTextToRussian(description);
      }
      return {
        description: description || "",
        description_ru: description_ru || "",
        description_en: description_en || ""
      };
    }

    async function searchBooksApi(query, limit = 10){
      try {
        const url = "https://openlibrary.org/search.json?q=" + encodeURIComponent(query) + "&limit=" + limit;
        const data = await fetchJson(url);
        const docs = Array.isArray(data.docs) ? data.docs : [];

        return docs.map(book => {
          const workKey = book.key || "";
          const title = book.title || "Untitled";
          const creator = (book.author_name || []).join(", ");
          return {
            title,
            category: "Books",
            creator,
            cover: book.cover_i ? getOpenLibraryCoverUrl(book.cover_i) : "",
            description: "",
            description_ru: "",
            description_en: "",
            work_key: workKey,
            canonical_key: buildCanonicalKey("Books", "openlibrary", workKey || title.toLowerCase(), title)
          };
        });
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
      description_en = ""
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
        description_en: description_en || autoLang.description_en || ""
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
      description_ru = "",
      description_en = ""
    }){
      return {
        id: -Date.now() - Math.floor(Math.random() * 1000),
        title: title || "",
        category: category || "",
        status: status || "Planned",
        cover: cover || "",
        description: description || "",
        description_ru: description_ru || "",
        description_en: description_en || "",
        creator: creator || "",
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

    async function saveItemFolder(){
      const item = getItemById(currentCategory, currentOpenItemId);
      const select = document.getElementById("details-folder-select");
      if(!item || !select){
        return;
      }

      const assignments = await getFolderAssignments();
      const folder = select.value || "";
      assignments[getItemStorageKey({ ...item, category: currentCategory })] = folder;
      await setFolderAssignments(assignments);

      item.folder = folder;
      renderShelf();
      await openCardById(item.id);
      alert(t().labels.folderSaved);
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
          description_en: item.description_en || "",
          creator: item.creator || "",
          work_key: item.work_key || "",
          canonical_key: item.canonical_key || "",
          folder: ""
        });
      });

      await applyFolderAssignmentsToItems(category);
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
      closeCardMenu();
      await openCardById(id);
      const folderSelect = document.getElementById("details-folder-select");
      if(folderSelect){
        folderSelect.focus();
      }
    }

    function renderShelf(){
      const shelf = document.getElementById("shelf");
      if(!shelf) return;

      closeCardMenu();
      shelf.innerHTML = "";

      const filterToolbar = document.getElementById("filter-toolbar");
      if(filterToolbar){
        if(currentCategory === "Blacklist" || isPublicView){
          filterToolbar.classList.add("hidden");
        } else {
          filterToolbar.classList.remove("hidden");
        }
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
        card.innerHTML = `
          <div class="media-card-top">
            <button class="media-cover media-cover-button" type="button" onclick="openCardById(${item.id})">
              ${coverHtml}
            </button>
            ${menuHtml}
          </div>
          <div class="media-info">
            <h3 class="media-title">${escapeHtml(item.title)}</h3>
            ${creatorLine}
            <div class="media-status">${escapeHtml(t().labels.statusLabel)}: ${escapeHtml(translateStatus(item.status || t().labels.unknownStatus))}</div>
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
      isPublicView = false;
      currentCategory = name;

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
      const item = currentSearchResults[index];
      if(!item) return;
      await addSearchResultToLibrary(item);
      closeAddModal();
      await loadCategoryFromSupabase(currentCategory);
    }

    async function addSearchResultToLibrary(item){
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
      let finalDescriptionEn = item.description_en || "";

      if(targetCategory === "Books"){
        const built = await buildBookDescriptions(item.title, item.creator || "", item.work_key || "");
        finalDescription = built.description || "";
        finalDescriptionRu = built.description_ru || "";
        finalDescriptionEn = built.description_en || "";
      } else if(finalDescription && (!finalDescriptionRu || !finalDescriptionEn)){
        const translated = await translateDescriptionFields(finalDescription);
        finalDescription = translated.description || finalDescription;
        finalDescriptionRu = finalDescriptionRu || translated.description_ru || "";
        finalDescriptionEn = finalDescriptionEn || translated.description_en || "";
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
        finalDescriptionEn || ""
      );

      if(!saved) return;

      insertLocalShelfItem(targetCategory, buildLocalShelfItem({
        title: item.title,
        category: targetCategory,
        status: "Planned",
        cover: item.cover || "",
        description: finalDescription || "",
        creator: item.creator || "",
        work_key: item.work_key || "",
        canonical_key: item.canonical_key || "",
        description_ru: finalDescriptionRu || "",
        description_en: finalDescriptionEn || ""
      }));

      await renderAndSyncCategory(targetCategory);
    }

    async function saveManualItem(){
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
        translated.description_en
      );

      if(!saved) return;

      insertLocalShelfItem(currentCategory, buildLocalShelfItem({
        title: title,
        category: currentCategory,
        status: "Planned",
        cover: cover,
        description: description,
        creator: creator,
        canonical_key: canonicalKey,
        description_ru: translated.description_ru,
        description_en: translated.description_en
      }));

      closeManualModal();
      closeAddModal();
      await renderAndSyncCategory(currentCategory);
    }

    function changeStatusById(id){
      closeCardMenu();
      const item = getItemById(currentCategory, id);
      if(!item) return;
      currentStatusItemId = id;
      currentOpenItemId = id;
      renderStatusOptions();
      document.getElementById("status-modal").classList.remove("hidden");
    }

    function changeStatusFromDetails(){
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
      await loadCategoryFromSupabase(currentCategory);
      alert(t().labels.canonicalSaved);
    }

    async function ensureItemDescriptions(item){
      if(!item) return item;

      let changed = false;

      if(currentCategory === "Books"){
        if(!item.description_ru || !item.description_en || !item.description){
          const descriptions = await buildBookDescriptions(
            item.title || "",
            item.creator || "",
            item.work_key || ""
          );

          if(descriptions.description && descriptions.description !== item.description){
            item.description = descriptions.description;
            changed = true;
          }
          if(descriptions.description_ru && descriptions.description_ru !== item.description_ru){
            item.description_ru = descriptions.description_ru;
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
      const folderSelect = document.getElementById("details-folder-select");

      if(canonicalInput && canonicalSection){
        canonicalSection.classList.add("hidden");
        canonicalInput.value = item?.canonical_key || "";
      }

      if(folderSection && folderSelect){
        if(isPublicView){
          folderSection.classList.add("hidden");
        } else {
          folderSection.classList.remove("hidden");
          await renderFolderFilterOptions();
          folderSelect.value = item?.folder || "";
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
    }

    async function showAuthorizedUI(){
      document.getElementById("auth-screen").classList.add("hidden");
      document.getElementById("home-screen").classList.remove("hidden");

      setAuthorizedButtons(true);
      refreshAccountCollectionsUI();
      safeLoadProfile("showAuthorizedUI");
    }

    async function checkAuth(){
      const user = await getCurrentUser();

      if(!user){
        document.getElementById("auth-screen").classList.remove("hidden");
        document.getElementById("home-screen").classList.add("hidden");
        setAuthorizedButtons(false);
        refreshAccountCollectionsUI();
      } else {
        await showAuthorizedUI();
      }
    }

function setAvatarPreview(url){
  const img = document.getElementById("avatar-img");
  if(!img) return;

  if(url && String(url).trim()){
    img.src = url;
    img.style.display = "block";
  } else {
    img.src = "https://via.placeholder.com/120x120?text=Avatar";
    img.style.display = "block";
  }
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

  const user = await getCurrentUser();
  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return;
  }

  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      id: user.id,
      username: username || null,
      display_name: displayName || null,
      is_public: isPublic
    });

  if(error){
    alert(error.message);
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
    if(usernameInput) usernameInput.value = "";
    if(displayNameInput) displayNameInput.value = "";
    if(publicInput) publicInput.checked = true;
    setAvatarPreview("");
  };

  try {
    const user = await getCurrentUser();
    if(!user){
      resetProfileFields();
      return;
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if(error || !data){
      resetProfileFields();
      return;
    }

    if(usernameInput) usernameInput.value = data.username || "";
    if(displayNameInput) displayNameInput.value = data.display_name || "";
    if(publicInput) publicInput.checked = data.is_public !== false;

    setAvatarPreview(data.avatar_url || "");
  } catch (error) {
    console.error("Load profile error:", error);
    resetProfileFields();
  }
}

    function openPublicCategory(name, profileName = "Library"){
      if(!isPublicView){
        return;
      }

      currentCategory = name;

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
        .select("id, username, display_name, is_public")
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

      if(profile.is_public === false){
        alert(t().labels.libraryPrivate);
        return false;
      }

      const { data, error } = await supabaseClient
        .from("user_media")
        .select("*")
        .eq("user_id", profile.id)
        .order("id", { ascending: false });

      if(error){
        console.error(error);
        return false;
      }

      isPublicView = true;
      currentPublicProfileName = profile.display_name || profile.username || "Library";

      demoData.Books = [];
      demoData.Movies = [];
      demoData.Series = [];
      demoData.Anime = [];
      demoData.Manga = [];
      demoData.Blacklist = [];

      const seen = new Set();

      data.forEach(item => {
        const dedupeKey =
          item.canonical_key ||
          item.work_key ||
          (item.title || "").trim().toLowerCase();

        const fullKey = `${item.category}:${dedupeKey}`;

        if(seen.has(fullKey)){
          return;
        }

        seen.add(fullKey);

        if(!demoData[item.category]){
          demoData[item.category] = [];
        }

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
          folder: ""
        });
      });

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

      if(path.startsWith("/u/")){
        const username = path.replace("/u/", "").trim();

        if(username){
          return await loadPublicLibrary(username);
        }
      }

      return false;
    }

    async function shareLibrary(){
      const user = await getCurrentUser();

      if(!user){
        alert(t().labels.mustBeLoggedIn);
        return;
      }

      const { data, error } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if(error || !data?.username){
        alert(t().labels.setUsernameFirst);
        return;
      }

      const url = window.location.origin + "/u/" + data.username;

      try {
        await navigator.clipboard.writeText(url);
        alert(t().labels.libraryLinkCopied + "\n" + url);
      } catch (e) {
        prompt(t().labels.libraryLinkCopied, url);
      }
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

  setAvatarPreview(avatarUrl);
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

  setAvatarPreview("");
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

    async function init(){
      applyTranslations();  
    
      window.addEventListener("error", (event) => {
        showRuntimeError(event?.message || "Unknown script error");
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message = reason?.message || reason || "Unhandled promise rejection";
        showRuntimeError(message);
      });

      supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        const loginBtn = document.getElementById("login-top-btn");
        const profileBtn = document.getElementById("profile-btn");

        if(session?.user){
          await showAuthorizedUI();
        } else {
          hideAllScreens();
          document.getElementById("auth-screen").classList.remove("hidden");

          if(loginBtn) loginBtn.classList.remove("hidden");
          if(profileBtn) profileBtn.classList.add("hidden");
        }
      });

      const openedPublic = await checkPublicRoute();

      if(!openedPublic){
        await checkAuth();
      }
    }

    init();
