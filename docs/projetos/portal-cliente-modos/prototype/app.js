(function () {
  "use strict";

  var key = "dioli.portal.view-mode.v1";
  var basic = document.getElementById("basic-view");
  var advanced = document.getElementById("advanced-view");
  var modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  var backdrop = document.querySelector(".modal-backdrop");
  var lastFocus = null;

  function validMode(value) {
    return value === "basic" || value === "advanced";
  }

  function applyMode(mode) {
    var next = validMode(mode) ? mode : "basic";
    basic.hidden = next !== "basic";
    advanced.hidden = next !== "advanced";
    modeButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === next));
    });
    window.localStorage.setItem(key, next);
  }

  modeButtons.forEach(function (button) {
    button.addEventListener("click", function () { applyMode(button.dataset.mode); });
  });

  function openModal(trigger) {
    lastFocus = trigger;
    backdrop.hidden = false;
    backdrop.querySelector("textarea").focus();
  }

  function closeModal() {
    backdrop.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll("[data-open-modal]").forEach(function (button) {
    button.addEventListener("click", function () { openModal(button); });
  });
  document.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function (event) { if (event.target === backdrop) closeModal(); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !backdrop.hidden) closeModal();
  });

  var saved = window.localStorage.getItem(key);
  applyMode(validMode(saved) ? saved : "basic");
})();
