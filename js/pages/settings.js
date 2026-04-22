export function renderSettingsPage(root) {
  root.innerHTML = `
    <section class="page">
      <section class="page-section placeholder-card">
        <div class="placeholder-title">Настройки</div>
        <div class="placeholder-text">
          Здесь будет полноценный экран настроек с разделами:
          аватар, имя пользователя, пароль, публичная карточка, внешний вид и NFC.
        </div>
      </section>
    </section>
  `;
}
