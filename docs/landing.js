(function () {
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      links.dataset.open = String(!isOpen);
      document.body.classList.toggle("nav-open", !isOpen);
    });

    links.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        toggle.setAttribute("aria-expanded", "false");
        links.dataset.open = "false";
        document.body.classList.remove("nav-open");
      }
    });
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.getAttribute("data-copy") || "";
      const originalLabel = button.textContent || "Copy";

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Select";
      }

      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1800);
    });
  });
})();
