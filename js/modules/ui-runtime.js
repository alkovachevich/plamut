export function createUiRuntime(deps){
  const {
    state,
    t,
    normalizeSpaces,
    escapeHtml,
    BASE_CATEGORIES,
    translateCategory,
    translateStatus,
    getAvailableStatuses,
    getBookDisplayTitle,
    getBookSecondaryTitle,
    getItemById,
    renderFolderRail,
    renderFolderManagerList,
    closePreferencesPanel,
    closeShareMenu,
    closeProfileMenu,
    closeDetailsMenu,
    closeShareSheet,
    closeFolderManagerSheet,
    closeItemActionsSheet,
    closeFolderModal,
    openFolderModalById,
    changeStatusById,
    deleteItemById,
    openCardById,
    removeItemFromFolderById,
    openManualModal,
    setTextIfPresent,
    openLibraryScreen
  } = deps;

  function syncShelfSearchInput(){
    const input = document.getElementById("shelf-search-input");
    if(input){
      input.value = state.currentShelfSearchQuery || "";
    }
  }

  function setShelfSearchQuery(value){
    state.currentShelfSearchQuery = normalizeSpaces(value);
  }

  function closeCardMenu(){
    state.currentOpenMenuItemId = null;

    document.querySelectorAll(".media-card.menu-open").forEach((card) => {
      card.classList.remove("menu-open");
    });

    document.querySelectorAll(".media-menu-btn[aria-expanded='true']").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function getFilteredItems(){
    const items = state.demoData[state.currentCategory] || [];
    const searchComparison = normalizeSpaces(state.currentShelfSearchQuery || "").toLowerCase();

    return items.filter((item) => {
      const statusMatches =
        state.currentCategory === "Blacklist" ||
        state.currentFilterStatus === "All" ||
        item.status === state.currentFilterStatus;

      const folderMatches =
        state.currentFilterFolder === "All" ||
        (state.currentFilterFolder === "__ungrouped__"
          ? !normalizeSpaces(item.folder || "")
          : normalizeSpaces(item.folder || "") === state.currentFilterFolder);

      const haystack = normalizeSpaces([
        item.title,
        item.creator,
        item.description_ru,
        item.description_original,
        item.description_en
      ].filter(Boolean).join(" ")).toLowerCase();

      const searchMatches = !searchComparison || haystack.includes(searchComparison);
      return statusMatches && folderMatches && searchMatches;
    });
  }

  function isMobileViewport(){
    return window.matchMedia("(max-width: 720px)").matches;
  }

  function openItemActionsSheet(id){
    const item = getItemById(state.currentCategory, id);
    if(!item) return;

    const list = document.getElementById("item-actions-list");
    if(!list) return;

    state.currentItemActionSheetId = id;

    setTextIfPresent("item-actions-title", item.title || t().buttons.moreActions);
    setTextIfPresent(
      "item-actions-subtitle",
      item.folder ? `${t().labels.folder}: ${item.folder}` : translateCategory(state.currentCategory)
    );

    list.innerHTML = "";

    const actions = [
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
          await deleteItemById(item.id, state.currentCategory);
        }
      }
    ];

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `button ${action.variant === "danger" ? "button-danger" : "button-secondary"}`;
      button.textContent = action.label;
      button.addEventListener("click", () => action.handler());
      list.appendChild(button);
    });

    document.getElementById("item-actions-sheet")?.classList.remove("hidden");
  }

  function toggleCardMenu(event, id){
    if(state.isPublicView){
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

    if(isMobileViewport()){
      openItemActionsSheet(id);
      return;
    }

    const nextId = state.currentOpenMenuItemId === id ? null : id;
    closeCardMenu();
    state.currentOpenMenuItemId = nextId;

    if(nextId === null) return;

    const card = document.querySelector(`.media-card[data-item-id="${id}"]`);
    const button = card?.querySelector(".media-menu-btn");

    if(card) card.classList.add("menu-open");
    if(button) button.setAttribute("aria-expanded", "true");
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

    if(filterToolbar){
      filterToolbar.classList.toggle("hidden", state.currentCategory === "Blacklist");
    }
    if(statusFilterWrap){
      statusFilterWrap.classList.toggle("hidden", state.currentCategory === "Blacklist");
    }

    const items = getFilteredItems();

    if(items.length === 0){
      shelf.innerHTML = `<div class="small">${escapeHtml(t().labels.noResults)}</div>`;
      return;
    }

    const buildChip = (label, type = "") => {
      return label ? `<span class="meta-chip ${type}">${escapeHtml(label)}</span>` : "";
    };

    const sortedItems = [...items].sort((a, b) => (b.id || 0) - (a.id || 0));

    sortedItems.forEach((item) => {
      const isBookItem = state.currentCategory === "Books";
      const displayTitle = isBookItem ? getBookDisplayTitle(item) : (item.title || "");
      const secondaryTitle = isBookItem ? getBookSecondaryTitle(item) : "";

      const coverHtml = item.cover
        ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(displayTitle)}">`
        : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;

      const creatorLine = item.creator
        ? `<div class="media-meta">${escapeHtml(item.creator)}</div>`
        : "";

      const chips = [
        buildChip(translateStatus(item.status || t().labels.unknownStatus), "is-status"),
        buildChip(translateCategory(state.currentCategory), "is-category"),
        buildChip(item.folder || "", "is-folder")
      ].join("");

      const menuHtml = state.isPublicView ? "" : `
        <div class="media-menu-wrap" onclick="event.stopPropagation()">
          <button
            class="media-menu-btn"
            type="button"
            aria-label="${escapeHtml(t().buttons.moreActions)}"
            aria-haspopup="true"
            aria-expanded="false"
            onclick="toggleCardMenu(event, ${item.id})"
          >⋮</button>
          <div class="media-menu" role="menu">
            <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); openFolderModalById(${item.id})">
              ${escapeHtml(item.folder ? t().buttons.moveToFolder : t().buttons.addToFolder)}
            </button>
            ${item.folder ? `
              <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); removeItemFromFolderById(${item.id}); closeCardMenu()">
                ${escapeHtml(t().buttons.removeFromFolder)}
              </button>
            ` : ""}
            <button class="media-menu-item" type="button" role="menuitem" onclick="event.stopPropagation(); changeStatusById(${item.id}); closeCardMenu()">
              ${escapeHtml(t().buttons.changeStatus)}
            </button>
            <button class="media-menu-item media-menu-item-danger" type="button" role="menuitem" onclick="event.stopPropagation(); deleteItemById(${item.id}); closeCardMenu()">
              ${escapeHtml(t().buttons.delete)}
            </button>
          </div>
        </div>
      `;

      const card = document.createElement("article");
      card.className = "media-card";
      card.dataset.itemId = item.id;

      card.innerHTML = `
        <div class="media-card-top">
          <button
            class="media-cover-button"
            type="button"
            aria-label="${escapeHtml(displayTitle || t().buttons.open)}"
            onclick="event.stopPropagation(); openCardById(${item.id})"
          >
            <div class="media-cover">${coverHtml}</div>
          </button>
          ${menuHtml}
        </div>
        <div class="media-info">
          <div class="media-meta-chips">${chips}</div>
          <h3 class="media-title">${escapeHtml(displayTitle)}</h3>
          ${secondaryTitle ? `<div class="media-subtitle">${escapeHtml(secondaryTitle)}</div>` : ""}
          ${creatorLine}
        </div>
      `;

      shelf.appendChild(card);
    });
  }

  function renderLibraryCategories(){
    const grid = document.getElementById("library-categories-grid");
    if(!grid) return;

    const query = normalizeSpaces(document.getElementById("library-search-input")?.value || "").toLowerCase();
    grid.innerHTML = "";

    BASE_CATEGORIES.forEach((category) => {
      const items = state.demoData[category] || [];
      const count = query
        ? items.filter((item) => normalizeSpaces(item.title || "").toLowerCase().includes(query)).length
        : items.length;

      if(query && count === 0) return;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "card category-card library-category-card";
      card.onclick = () => {
        if(typeof openLibraryScreen === "function"){
          // noop placeholder for parity
        }
        window.openCategory(category);
      };
      card.innerHTML = `<span>${escapeHtml(translateCategory(category))}</span><span class="small">${count}</span>`;
      grid.appendChild(card);
    });
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
        window.setStatus(status);
      });
      container.appendChild(button);
    });
  }

  function renderUiCollections(){
    renderFolderRail();
    renderFolderManagerList();
    renderStatusOptions();
  }

  function rerenderCurrentScreen(){
    if(!document.getElementById("category-screen")?.classList.contains("hidden") && state.currentCategory){
      if(state.isPublicView){
        document.getElementById("category-title").textContent =
          state.currentPublicProfileName + " — " + translateCategory(state.currentCategory);
      } else {
        document.getElementById("category-title").textContent = translateCategory(state.currentCategory);
      }
      renderShelf();
    }

    if(!document.getElementById("details-screen")?.classList.contains("hidden") && state.currentOpenItemId){
      const item = getItemById(state.currentCategory, state.currentOpenItemId);
      if(item){
        openCardById(state.currentOpenItemId);
      }
    }
  }

  function applyTranslations(currentLanguage){
    document.documentElement.lang = currentLanguage || state.currentLanguage;

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
    document.getElementById("status-cancel").textContent = t().buttons.cancel;

    document.getElementById("login-top-btn").textContent = t().topbar.login;
    document.getElementById("share-library-btn").textContent = t().topbar.shareLibrary;
    document.getElementById("auth-text").textContent = t().auth.text;

    setTextIfPresent("library-screen-title", t().home.libraryTitle);
    setTextIfPresent("back-library-home-btn", t().buttons.backHome);
    setTextIfPresent("filter-toggle-btn", currentLanguage === "ru" ? "Фильтр" : "Filter");
    setTextIfPresent("folder-manager-title", t().profile.folderManagerTitle);
    setTextIfPresent("folder-manager-subtitle", t().profile.folderManagerHint);
    setTextIfPresent("folder-manager-create-btn", t().profile.createFolder);
    setTextIfPresent("folder-manager-cancel-btn", t().buttons.cancel);
    setTextIfPresent("item-actions-cancel-btn", t().buttons.cancel);

    const folderInput = document.getElementById("folder-manager-input");
    if(folderInput){
      folderInput.placeholder = t().profile.customFolderLabel;
    }

    const librarySearchInput = document.getElementById("library-search-input");
    if(librarySearchInput){
      librarySearchInput.placeholder = t().modals.searchPlaceholder;
    }

    const filterSelect = document.getElementById("status-filter");
    if(filterSelect){
      getAvailableStatuses().then((statuses) => {
        filterSelect.innerHTML = `
          <option value="All">${escapeHtml(t().labels.allStatuses)}</option>
          ${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(translateStatus(status))}</option>`).join("")}
        `;
        filterSelect.value =
          statuses.includes(state.currentFilterStatus) || state.currentFilterStatus === "All"
            ? state.currentFilterStatus
            : "All";
      });
    }

    renderUiCollections();
  }

  function closeAllFloatingUi(){
    closePreferencesPanel();
    closeShareMenu();
    closeProfileMenu();
    closeDetailsMenu();
    closeShareSheet();
    closeFolderManagerSheet();
    closeItemActionsSheet();
    closeFolderModal();
    closeCardMenu();
  }

  return {
    syncShelfSearchInput,
    setShelfSearchQuery,
    closeCardMenu,
    getFilteredItems,
    openItemActionsSheet,
    toggleCardMenu,
    renderShelf,
    renderLibraryCategories,
    renderStatusOptions,
    renderUiCollections,
    rerenderCurrentScreen,
    applyTranslations,
    closeAllFloatingUi
  };
}
