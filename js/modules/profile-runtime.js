export function createProfileRuntime(deps){
  const {
    state,
    t,
    supabaseClient,
    normalizeSpaces,
    getCurrentUser,
    ensureCurrentProfileData,
    upsertCurrentProfilePatch,
    getProfileInitials,
    syncHeaderProfileIdentity,
    setAuthorizedUi
  } = deps;

  function setAvatarPreview(url = "", displayName = "", username = ""){
    const headerAvatar = document.getElementById("header-profile-avatar");
    const headerFallback = document.getElementById("header-profile-fallback");
    const profileAvatarImg = document.getElementById("profile-avatar-img");
    const profileAvatarFallback = document.getElementById("profile-avatar-fallback");

    const initials = getProfileInitials(displayName, username);
    const hasUrl = Boolean(url);

    if(headerAvatar){
      headerAvatar.src = hasUrl ? url : "";
      headerAvatar.classList.toggle("hidden", !hasUrl);
    }

    if(headerFallback){
      headerFallback.textContent = initials;
      headerFallback.classList.toggle("hidden", hasUrl);
    }

    if(profileAvatarImg){
      profileAvatarImg.src = hasUrl ? url : "";
      profileAvatarImg.classList.toggle("hidden", !hasUrl);
    }

    if(profileAvatarFallback){
      profileAvatarFallback.textContent = initials;
      profileAvatarFallback.classList.toggle("hidden", hasUrl);
    }
  }

  function togglePasswordVisibility(){
    const show = Boolean(document.getElementById("profile-show-password")?.checked);
    const newPassword = document.getElementById("new-password");
    const confirmPassword = document.getElementById("confirm-password");

    if(newPassword){
      newPassword.type = show ? "text" : "password";
    }
    if(confirmPassword){
      confirmPassword.type = show ? "text" : "password";
    }
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

  async function changePassword(){
    const newPassword = document.getElementById("new-password")?.value || "";
    const confirmPassword = document.getElementById("confirm-password")?.value || "";

    if(!newPassword || !confirmPassword){
      alert(t().profile.passwordRequired);
      return false;
    }

    if(newPassword !== confirmPassword){
      alert(t().profile.passwordMismatch);
      return false;
    }

    if(newPassword.length < 6){
      alert(t().profile.passwordTooShort);
      return false;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

    if(error){
      console.error("Password change error:", error);
      alert(error.message || t().profile.passwordChangeError);
      return false;
    }

    resetProfileSecurityFields();
    alert(t().profile.passwordChanged);
    return true;
  }

  async function uploadAvatar(){
    const input = document.getElementById("profile-avatar-file");
    const file = input?.files?.[0];
    const user = await getCurrentUser();

    if(!user){
      alert(t().labels.mustBeLoggedIn);
      return false;
    }

    if(!file){
      alert(t().profile.avatarSelectFile);
      return false;
    }

    const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if(uploadError){
      console.error("Avatar upload error:", uploadError);
      alert(uploadError.message || t().profile.avatarUploadError);
      return false;
    }

    const { data } = supabaseClient.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const publicUrl = data?.publicUrl || "";
    const profile = await upsertCurrentProfilePatch({ avatar_url: publicUrl });

    if(profile){
      setAvatarPreview(
        profile.avatar_url || "",
        profile.display_name || profile.public_card_title || "",
        profile.username || ""
      );
      syncHeaderProfileIdentity(
        profile.display_name || profile.public_card_title || "",
        profile.username || ""
      );
      alert(t().profile.avatarUploaded);
      return true;
    }

    return false;
  }

  async function removeAvatar(){
    const profile = await ensureCurrentProfileData();
    if(!profile){
      alert(t().labels.mustBeLoggedIn);
      return false;
    }

    const nextProfile = await upsertCurrentProfilePatch({ avatar_url: null });

    if(nextProfile){
      setAvatarPreview(
        "",
        nextProfile.display_name || nextProfile.public_card_title || "",
        nextProfile.username || ""
      );
      syncHeaderProfileIdentity(
        nextProfile.display_name || nextProfile.public_card_title || "",
        nextProfile.username || ""
      );
      alert(t().profile.avatarRemoved);
      return true;
    }

    return false;
  }

  async function loadProfile(){
    const profile = await ensureCurrentProfileData();
    if(!profile) return null;

    const username = normalizeSpaces(profile.username || "");
    const displayName = normalizeSpaces(profile.display_name || "");
    const isPublic = Boolean(profile.public_share_enabled ?? profile.is_public ?? true);

    const usernameInput = document.getElementById("profile-username");
    const displayNameInput = document.getElementById("profile-display-name");
    const publicToggle = document.getElementById("profile-public-toggle");

    if(usernameInput) usernameInput.value = username;
    if(displayNameInput) displayNameInput.value = displayName;
    if(publicToggle) publicToggle.checked = isPublic;

    setAvatarPreview(
      profile.avatar_url || "",
      displayName || profile.public_card_title || "",
      username
    );

    syncHeaderProfileIdentity(
      displayName || profile.public_card_title || "",
      username
    );

    return profile;
  }

  async function saveProfile(){
    const username = normalizeSpaces(document.getElementById("profile-username")?.value || "");
    const displayName = normalizeSpaces(document.getElementById("profile-display-name")?.value || "");
    const isPublic = Boolean(document.getElementById("profile-public-toggle")?.checked);

    if(username && !/^[a-zA-Z0-9_]+$/.test(username)){
      alert(t().profile.usernameInvalid);
      return false;
    }

    const profile = await upsertCurrentProfilePatch({
      username: username || null,
      display_name: displayName || null,
      public_share_enabled: isPublic,
      is_public: isPublic
    });

    if(!profile){
      return false;
    }

    setAvatarPreview(
      profile.avatar_url || "",
      profile.display_name || profile.public_card_title || "",
      profile.username || ""
    );

    syncHeaderProfileIdentity(
      profile.display_name || profile.public_card_title || "",
      profile.username || ""
    );

    setAuthorizedUi(true);
    alert(t().profile.saved);
    return true;
  }

  async function openProfileModal(){
    const user = await getCurrentUser();
    if(!user){
      alert(t().labels.mustBeLoggedIn);
      return false;
    }

    document.getElementById("profile-modal")?.classList.remove("hidden");
    await loadProfile();
    resetProfileSecurityFields();
    return true;
  }

  function closeProfileModal(){
    document.getElementById("profile-modal")?.classList.add("hidden");
    resetProfileSecurityFields();
  }

  async function openProfileFromMenu(){
    document.getElementById("profile-menu")?.classList.add("hidden");
    return await openProfileModal();
  }

  return {
    setAvatarPreview,
    togglePasswordVisibility,
    resetProfileSecurityFields,
    changePassword,
    uploadAvatar,
    removeAvatar,
    loadProfile,
    saveProfile,
    openProfileModal,
    closeProfileModal,
    openProfileFromMenu
  };
}
