export function createLibraryRuntime(deps){
  const {
    state,
    t,
    supabaseClient,
    normalizeSpaces,
    normalizeComparisonText,
    getCurrentUser,
    getItemById,
    clearRelationCache,
    renderShelf,
    buildCanonicalKey,
    deriveBookTitleFields,
    normalizeDescriptionFields,
    buildBookDescriptions,
    enrichBookTitleFieldsForSave,
    dedupeSearchResults,
    searchByCategory,
    getBookDisplayTitle,
    getBookSecondaryTitle,
    looksLikeRussian,
    looksLikeEnglish
  } = deps;

  function clearSearchCaches(){
    state.categorySearchCache.clear();
    state.categorySearchInFlight.clear();
  }

  function isDuplicateItem(category, title, workKey = ""){
    const items = state.demoData[category] || [];

    return items.some((item) => {
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
    title_ru = "",
    title_en = "",
    title_original = "",
    description_original = "",
    folder_name = ""
  ){
    const user = await getCurrentUser();

    if(!user){
      alert(t().labels.mustBeLoggedIn);
      return false;
    }

    const titleFields = deriveBookTitleFields(title, title_ru, title_en, title_original || title);
    const finalCanonicalKey =
      canonicalKey ||
      workKey ||
      (titleFields.title || "").trim().toLowerCase();

    const autoLang = await normalizeDescriptionFields(description);
    const originalDescription = description_original || description_en || autoLang.description_original || "";

    const insertData = {
      user_id: user.id,
      title: titleFields.title,
      title_ru: titleFields.title_ru,
      title_en: titleFields.title_en,
      title_original: titleFields.title_original,
      category: category,
      status: status || "Planned",
      cover_url: cover,
      description: description || "",
      description_ru: description_ru || autoLang.description_ru || "",
      description_en: description_en || originalDescription || autoLang.description_en || "",
      description_original: originalDescription || "",
      creator: creator || "",
      work_key: workKey || "",
      canonical_key: finalCanonicalKey,
      folder_name: folder_name || ""
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
    title_ru = "",
    title_en = "",
    title_original = "",
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
    const titleFields = deriveBookTitleFields(title || "", title_ru || "", title_en || "", title_original || title || "");
    return {
      id: -Date.now() - Math.floor(Math.random() * 1000),
      title: titleFields.title,
      title_ru: titleFields.title_ru,
      title_en: titleFields.title_en,
      title_original: titleFields.title_original,
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
      canonical_key: canonical_key || work_key || (titleFields.title || "").trim().toLowerCase(),
      folder: folder || ""
    };
  }

  function insertLocalShelfItem(category, item){
    if(!category || !item){
      return;
    }

    if(!state.demoData[category]){
      state.demoData[category] = [];
    }

    const dedupeKey =
      item.canonical_key ||
      item.work_key ||
      normalizeSpaces(item.title || "").toLowerCase();

    const alreadyExists = state.demoData[category].some((row) => {
      const rowKey =
        row.canonical_key ||
        row.work_key ||
        normalizeSpaces(row.title || "").toLowerCase();

      return rowKey === dedupeKey;
    });

    if(!alreadyExists){
      state.demoData[category].unshift(item);
      clearRelationCache();
      clearSearchCaches();
    }
  }

  async function updateDescriptionsInSupabase(itemId, description, description_ru, description_en, description_original = ""){
    const user = await getCurrentUser();
    if(!user || !itemId) return false;

    const { error } = await supabaseClient
      .from("user_media")
      .update({
        description: description || "",
        description_ru: description_ru || "",
        description_en: description_en || "",
        description_original: description_original || description_en || ""
      })
      .eq("user_id", user.id)
      .eq("id", itemId);

    if(error){
      console.error("Supabase description update error:", error);
      return false;
    }

    return true;
  }

  async function deleteItemFromSupabase(item, category){
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
      state.demoData[category] = [];
      return false;
    }

    const { data, error } = await supabaseClient
      .from("user_media")
      .select("id, title, title_ru, title_en, title_original, status, cover_url, description, description_ru, description_en, description_original, creator, work_key, canonical_key, category, folder_name")
      .eq("user_id", user.id)
      .eq("category", category)
      .order("id", { ascending: false });

    if(error){
      console.error("Supabase load error:", error);
      state.demoData[category] = [];
      return false;
    }

    state.demoData[category] = [];
    const seen = new Set();

    data.forEach((item) => {
      const dedupeKey =
        item.canonical_key ||
        item.work_key ||
        (item.title || "").trim().toLowerCase();

      if(seen.has(dedupeKey)){
        return;
      }

      seen.add(dedupeKey);

      const titleFields = deriveBookTitleFields(
        item.title || "",
        item.title_ru || "",
        item.title_en || "",
        item.title_original || item.original_title || item.title || ""
      );

      state.demoData[category].push({
        id: item.id,
        title: titleFields.title,
        status: item.status || "Planned",
        cover: item.cover_url || "",
        description: item.description || "",
        description_ru: item.description_ru || "",
        description_original: item.description_original || item.description_en || "",
        description_en: item.description_en || "",
        title_ru: titleFields.title_ru,
        title_en: titleFields.title_en,
        title_original: titleFields.title_original,
        creator: item.creator || "",
        work_key: item.work_key || "",
        canonical_key: item.canonical_key || "",
        folder: item.folder_name || ""
      });
    });

    return true;
  }

  async function renderCategorySearchResults(currentCategory, currentLanguage, openManualModal){
    clearTimeout(state.searchTimer);
    const searchToken = ++state.activeCategorySearchToken;

    state.searchTimer = setTimeout(async () => {
      const container = document.getElementById("search-results");
      const input = document.getElementById("search-input");

      if(!container || !input) return;

      const query = normalizeSpaces(input.value);
      container.innerHTML = "";

      if(!query){
        container.innerHTML = `<div class="small">${t().labels.noResults}</div>`;
        return;
      }

      container.innerHTML = `<div class="small">${t().labels.searching}</div>`;

      try {
        const results = dedupeSearchResults(await searchByCategory(currentCategory, query, 10));
        if(searchToken !== state.activeCategorySearchToken) return;
        state.currentSearchResults = results;

        if(results.length === 0){
          container.innerHTML = `
            <div class="small">${t().labels.noResults}</div>
            <div class="modal-actions" style="justify-content:flex-start;margin-top:12px;">
              <button class="button" onclick="openManualModal()">${t().buttons.manualAdd}</button>
            </div>
          `;
          return;
        }

        container.innerHTML = "";

        results.forEach((item, index) => {
          const row = document.createElement("div");
          row.className = "search-item";
          const isBooksCategory = currentCategory === "Books";
          const displayTitle = isBooksCategory ? getBookDisplayTitle(item) : (item.title || "");
          const secondaryTitle = isBooksCategory ? getBookSecondaryTitle(item) : "";

          row.innerHTML = `
            <div class="search-item-left">
              <div class="search-thumb">
                ${item.cover ? `<img src="${item.cover}" alt="${displayTitle}">` : t().labels.cover}
              </div>
              <div class="search-item-text">
                <div class="search-item-title">${displayTitle}</div>
                ${secondaryTitle ? `<div class="search-item-subtitle">${secondaryTitle}</div>` : ""}
                <div class="search-item-meta">${item.creator || ""}</div>
              </div>
            </div>
            <button class="button" ${item.already_added ? "disabled" : ""} onclick="addCategorySearchResult(${index})">${item.already_added ? (currentLanguage === "ru" ? "Уже добавлено" : "Added") : t().buttons.add}</button>
          `;

          container.appendChild(row);
        });
      } catch (error) {
        console.error("Category search error:", error);
        if(searchToken !== state.activeCategorySearchToken) return;

        container.innerHTML = `
          <div class="small">${t().labels.apiError}: ${error.message}</div>
          <div class="modal-actions" style="justify-content:flex-start;margin-top:12px;">
            <button class="button" onclick="openManualModal()">${t().buttons.manualAdd}</button>
          </div>
        `;
      }
    }, 350);
  }

  async function addCategorySearchResult(index, currentCategory){
    const item = state.currentSearchResults[index];
    if(!item) return;
    if(item.already_added){
      alert(t().labels.alreadyExists);
      return;
    }
    await addSearchResultToLibrary(item);
    await loadCategoryFromSupabase(currentCategory);
  }

  async function addSearchResultToLibrary(item){
    if(!item) return;
    if(item.already_added){
      alert(t().labels.alreadyExists);
      return;
    }

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

    const itemForSave = targetCategory === "Books" ? enrichBookTitleFieldsForSave(item) : item;

    let finalDescription = itemForSave.description || "";
    let finalDescriptionRu = itemForSave.description_ru || "";
    let finalDescriptionOriginal = itemForSave.description_original || itemForSave.description_en || "";
    let finalDescriptionEn = itemForSave.description_en || itemForSave.description_original || "";

    if(targetCategory === "Books"){
      const hasLocalized = Boolean(finalDescriptionRu && (finalDescriptionOriginal || finalDescriptionEn) && finalDescription);
      if(!hasLocalized){
        const built = await buildBookDescriptions(itemForSave.title, itemForSave.creator || "", itemForSave.work_key || "", itemForSave.isbn || "");
        finalDescription = finalDescription || built.description || "";
        finalDescriptionRu = finalDescriptionRu || built.description_ru || "";
        finalDescriptionOriginal = finalDescriptionOriginal || built.description_original || built.description_en || "";
        finalDescriptionEn = finalDescriptionEn || built.description_en || built.description_original || "";
      }
    } else if(finalDescription && (!finalDescriptionRu || !finalDescriptionEn)){
      const translated = await normalizeDescriptionFields(finalDescription, { translateMissing: true });
      finalDescription = translated.description || finalDescription;
      finalDescriptionRu = finalDescriptionRu || translated.description_ru || "";
      finalDescriptionOriginal = finalDescriptionOriginal || translated.description_original || translated.description_en || "";
      finalDescriptionEn = finalDescriptionEn || translated.description_en || translated.description_original || "";
    }

    const saved = await saveItemToSupabase(
      itemForSave.title,
      targetCategory,
      "Planned",
      itemForSave.cover || "",
      finalDescription || "",
      itemForSave.creator || "",
      itemForSave.work_key || "",
      itemForSave.canonical_key || "",
      finalDescriptionRu || "",
      finalDescriptionEn || "",
      itemForSave.title_ru || "",
      itemForSave.title_en || "",
      itemForSave.title_original || "",
      finalDescriptionOriginal || "",
      itemForSave.folder || ""
    );

    if(!saved) return;

    insertLocalShelfItem(targetCategory, buildLocalShelfItem({
      title: itemForSave.title,
      title_ru: itemForSave.title_ru || "",
      title_en: itemForSave.title_en || "",
      title_original: itemForSave.title_original || "",
      category: targetCategory,
      status: "Planned",
      cover: itemForSave.cover || "",
      description: finalDescription || "",
      creator: itemForSave.creator || "",
      isbn: itemForSave.isbn || "",
      work_key: itemForSave.work_key || "",
      canonical_key: itemForSave.canonical_key || "",
      description_ru: finalDescriptionRu || "",
      description_original: finalDescriptionOriginal || finalDescriptionEn || "",
      description_en: finalDescriptionEn || ""
    }));
  }

  async function saveManualItem(currentCategory){
    const title = document.getElementById("manual-name").value.trim();
    const creator = document.getElementById("manual-creator").value.trim();
    const cover = document.getElementById("manual-cover").value.trim();
    const description = document.getElementById("manual-description").value.trim();

    if(!title){
      alert(t().labels.manualNameRequired);
      return false;
    }

    const canonicalKey = buildCanonicalKey(currentCategory, "manual", "", title);

    if(isDuplicateItem(currentCategory, title)){
      alert(t().labels.alreadyExists);
      return false;
    }

    const existsInDb = await existsInSupabase(currentCategory, title, "", canonicalKey);
    if(existsInDb){
      alert(t().labels.alreadyExists);
      await loadCategoryFromSupabase(currentCategory);
      return false;
    }

    const translated = await normalizeDescriptionFields(description, { translateMissing: true });

    const manualTitleFields = deriveBookTitleFields(
      title,
      looksLikeRussian(title) ? title : "",
      looksLikeEnglish(title) ? title : "",
      title
    );

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
      manualTitleFields.title_ru,
      manualTitleFields.title_en,
      manualTitleFields.title_original,
      translated.description_original || translated.description_en,
      ""
    );

    if(!saved) return false;

    insertLocalShelfItem(currentCategory, buildLocalShelfItem({
      title,
      title_ru: manualTitleFields.title_ru,
      title_en: manualTitleFields.title_en,
      title_original: manualTitleFields.title_original,
      category: currentCategory,
      status: "Planned",
      cover,
      description,
      creator,
      isbn: "",
      canonical_key: canonicalKey,
      description_ru: translated.description_ru,
      description_original: translated.description_original || translated.description_en,
      description_en: translated.description_en
    }));

    return true;
  }

  async function saveCanonicalKey(currentCategory, currentOpenItemId){
    const keyInput = document.getElementById("canonical-key-input");
    if(!keyInput) return false;

    const key = keyInput.value.trim();
    if(!key) return false;

    const user = await getCurrentUser();
    if(!user){
      alert(t().labels.mustBeLoggedIn);
      return false;
    }

    const item = getItemById(currentCategory, currentOpenItemId);
    if(!item?.id){
      alert(t().labels.itemNotFound);
      return false;
    }

    const { error } = await supabaseClient
      .from("user_media")
      .update({ canonical_key: key })
      .eq("user_id", user.id)
      .eq("id", item.id);

    if(error){
      console.error("Canonical key update error:", error);
      alert(t().labels.canonicalSaveError);
      return false;
    }

    item.canonical_key = key;
    clearRelationCache();
    await loadCategoryFromSupabase(currentCategory);
    alert(t().labels.canonicalSaved);
    return true;
  }

  async function ensureItemDescriptions(item, currentCategory, isPublicView = false){
    if(!item) return item;

    let changed = false;

    if(currentCategory === "Books"){
      if(!item.description_original && item.description_en){
        item.description_original = item.description_en;
      }

      if(!item.description_ru || !(item.description_original || item.description_en) || !item.description){
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
      if(state.currentLanguage === "ru" && !item.description_ru && item.description){
        if(looksLikeRussian(item.description)){
          item.description_ru = item.description;
          changed = true;
        } else if(looksLikeEnglish(item.description)){
          const translated = await normalizeDescriptionFields(item.description, { translateMissing: true });
          if(translated.description_ru){
            item.description_ru = translated.description_ru;
            changed = true;
          }
        }
      }

      if(state.currentLanguage === "en" && !item.description_en && item.description){
        if(looksLikeEnglish(item.description)){
          item.description_en = item.description;
          changed = true;
        } else if(looksLikeRussian(item.description)){
          const translated = await normalizeDescriptionFields(item.description, { translateMissing: true });
          if(translated.description_en){
            item.description_en = translated.description_en;
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
        item.description_en || "",
        item.description_original || ""
      );
    }

    return item;
  }

  async function deleteItemById(id, currentCategory){
    const item = getItemById(currentCategory, id);
    if(!item) return false;

    const confirmed = confirm(t().labels.confirmDelete);
    if(!confirmed) return false;

    const index = (state.demoData[currentCategory] || []).findIndex((x) => x.id === id);
    const removedItem = item;

    if(index !== -1){
      state.demoData[currentCategory].splice(index, 1);
      clearRelationCache();
    }

    renderShelf();

    const deleted = await deleteItemFromSupabase(removedItem, currentCategory);

    if(!deleted){
      if(index !== -1){
        state.demoData[currentCategory].splice(index, 0, removedItem);
      }
      renderShelf();
      alert(t().labels.deleteError);
      return false;
    }

    await loadCategoryFromSupabase(currentCategory);
    return true;
  }

  return {
    clearSearchCaches,
    isDuplicateItem,
    existsInSupabase,
    saveItemToSupabase,
    buildLocalShelfItem,
    insertLocalShelfItem,
    updateDescriptionsInSupabase,
    deleteItemFromSupabase,
    loadCategoryFromSupabase,
    renderCategorySearchResults,
    addCategorySearchResult,
    addSearchResultToLibrary,
    saveManualItem,
    saveCanonicalKey,
    ensureItemDescriptions,
    deleteItemById
  };
}
