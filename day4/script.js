// Select elements
const textarea = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

const DRAFT_KEY = "noteDraft";
const THEME_KEY = "noteTheme";

// Update both counters and the warning classes
function updateCounts() {
  const text = textarea.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / 200 characters`;
  wordCount.textContent = `${words} words`;

  charCount.classList.toggle("warning", chars > 180 && chars <= 200);
  charCount.classList.toggle("over", chars > 200);
}

// Save the draft
function saveDraft() {
  localStorage.setItem(DRAFT_KEY, textarea.value);
}

// Clear the textarea, counters and saved draft
function clearAll() {
  textarea.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
}

// Apply a theme and update the button label
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

// On every input: update counters and save the draft
textarea.addEventListener("input", function () {
  updateCounts();
  saveDraft();
});

// Escape inside the textarea clears everything
textarea.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

// Clear button
clearBtn.addEventListener("click", clearAll);

// Theme button: toggle and remember the choice
themeToggle.addEventListener("click", function () {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

// On page load: restore draft and theme, then update counters
const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft !== null) {
  textarea.value = savedDraft;
}
applyTheme(localStorage.getItem(THEME_KEY) === "dark");
updateCounts();