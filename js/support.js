(function () {
  const PROMPTPAY_NUMBER = "095-551-3256";
  const QR_SRC = new URL("../images/promptpay-qr.jpg", document.currentScript.src).href;

  const cupIcon =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>';

  let backdrop = null;

  function build() {
    backdrop = document.createElement("div");
    backdrop.className = "support-backdrop";
    backdrop.innerHTML = `
      <div class="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-title">
        <button type="button" class="support-close" data-support-close aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="support-head">
          <span class="support-icon">${cupIcon}</span>
          <h2 id="support-title">Buy me a coffee</h2>
          <p>If this question bank helps your ATPL study, you can support it via PromptPay. Thank you!</p>
        </div>
        <div class="support-qr">
          <img alt="PromptPay QR code" hidden>
          <span class="support-qr-empty">QR code coming soon</span>
        </div>
        <div class="support-pp">
          <span class="support-label">PromptPay</span>
          <div class="support-number">
            <strong>${PROMPTPAY_NUMBER}</strong>
            <button type="button" class="support-copy" data-support-copy>Copy</button>
          </div>
        </div>
      </div>`;

    const img = backdrop.querySelector(".support-qr img");
    img.addEventListener("load", () => {
      img.hidden = false;
      backdrop.querySelector(".support-qr-empty").hidden = true;
    });
    img.src = QR_SRC;

    backdrop.addEventListener("click", async (e) => {
      if (e.target === backdrop || e.target.closest("[data-support-close]")) close();
      const copy = e.target.closest("[data-support-copy]");
      if (copy) {
        try {
          await navigator.clipboard.writeText(PROMPTPAY_NUMBER.replace(/\D/g, ""));
          copy.textContent = "Copied";
        } catch {
          copy.textContent = "Copy failed";
        }
        setTimeout(() => (copy.textContent = "Copy"), 1600);
      }
    });
    document.body.appendChild(backdrop);
  }

  function open() {
    if (!backdrop) build();
    requestAnimationFrame(() => backdrop.classList.add("show"));
    backdrop.querySelector(".support-close").focus();
  }

  function close() {
    backdrop?.classList.remove("show");
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".bmc-btn")) return;
    e.preventDefault();
    open();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();
