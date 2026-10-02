let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// Returns notes whose text contains the word (ignores upper/lower case)
function searchNotes(word) {
  const term = word.toLowerCase();
  return notes.filter(note => note.text.toLowerCase().includes(term));
}

// Returns the note with the most characters, or null if there are no notes
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// Returns an object counting notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// Returns a sentence such as "5 notes: 2 personal, 2 study, 1 work."
function getSummary() {
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";

  if (total === 0) {
    return `0 ${word}.`;
  }

  const counts = countByCategory();
  const parts = Object.entries(counts).map(
    ([category, count]) => `${count} ${category}`
  );
  return `${total} ${word}: ${parts.join(", ")}.`;
}

// Makes text comparable: trimmed, lower-case, single spaces
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns true if a note with the same text already exists
function isDuplicate(text) {
  const target = normalize(text);
  return notes.some(note => normalize(note.text) === target);
}

// Adds a note if valid. Returns true when added, false otherwise (and logs why)
function addNote(text, category) {
  const cleaned = typeof text === "string" ? text.trim() : "";

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1-200 characters.");
    return false;
  }

  if (!CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  if (isDuplicate(cleaned)) {
    console.log("Not added: a note with this text already exists.");
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: newId, text: cleaned, category: category });
  return true;
}

// ---------------- TESTS ----------------

// Tests for searchNotes
console.log(searchNotes("the"));
// Expected: [ {id: 2, text: "Finish the Day 3 assignment", category: "study"}, {id: 3, text: "Email the project report to Grace", category: "work"} ]

console.log(searchNotes("MILK"));
// Expected: [ {id: 1, text: "Buy milk and bread", category: "personal"} ]

console.log(searchNotes("banana"));
// Expected: []

// Tests for longestNote
console.log(longestNote());
// Expected: {id: 3, text: "Email the project report to Grace", category: "work"}

const backupNotes = notes; // save the real notes
notes = [];
console.log(longestNote());
// Expected: null (edge case: no notes)
notes = backupNotes; // put the real notes back

// Tests for countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

notes = [];
console.log(countByCategory());
// Expected: {} (edge case: no notes)
notes = backupNotes;

// Tests for getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 2 study, 1 work."

notes = [backupNotes[0]];
console.log(getSummary());
// Expected: "1 note: 1 personal." (edge case: exactly one note)
notes = backupNotes;

// Tests for isDuplicate
console.log(isDuplicate("  buy MILK   and bread  "));
// Expected: true (ignores case and extra spaces)

console.log(isDuplicate("Walk the dog"));
// Expected: false

// Tests for addNote
console.log(addNote("Walk the dog", "personal"));
// Expected: true

console.log(notes.length);
// Expected: 6

console.log(addNote("  walk THE dog ", "personal"));
// Expected: "Not added: a note with this text already exists." then false

console.log(addNote("", "work"));
// Expected: "Not added: text must be 1-200 characters." then false

console.log(addNote("a".repeat(201), "work"));
// Expected: "Not added: text must be 1-200 characters." then false

console.log(addNote("Plan a trip", "holiday"));
// Expected: "Not added: category must be personal, work or study." then false

console.log(getSummary());
// Expected: "6 notes: 3 personal, 2 study, 1 work."