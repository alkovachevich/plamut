export function createStorageRuntime(deps){
  const {
    state,
    getCurrentUser,
    normalizeSpaces
  } = deps;

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
    const dynamicStatuses = Object.values(state.demoData)
      .flat()
      .map((item) => normalizeSpaces(item?.status || ""))
      .filter(Boolean);

    return Array.from(new Set([
      "Planned",
      "In progress",
      "Done",
      "Dropped",
      ...customStatuses,
      ...dynamicStatuses
    ]));
  }

  async function getAvailableFolders(){
    const customFolders = await getCustomFolders();
    const dynamicFolders = Object.values(state.demoData)
      .flat()
      .map((item) => normalizeSpaces(item?.folder || ""))
      .filter(Boolean);

    return Array.from(new Set([
      ...customFolders,
      ...dynamicFolders
    ]));
  }

  return {
    getCurrentUserId,
    getAccountStorageValue,
    setAccountStorageValue,
    getCustomStatuses,
    setCustomStatuses,
    getCustomFolders,
    setCustomFolders,
    getFolderAssignments,
    setFolderAssignments,
    getAvailableStatuses,
    getAvailableFolders
  };
}
