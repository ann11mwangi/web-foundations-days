const loadBtn = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// Stores the loaded users so filtering needs no new request
let users = [];

async function loadUsers() {
  loadBtn.disabled = true;
  statusEl.textContent = "Loading users...";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    users = await response.json();
    applyFilter();
    statusEl.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    statusEl.textContent = `Error: could not load users. (${error.message})`;
  } finally {
    loadBtn.disabled = false;
  }
}

// Draws any array of users
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    const message = document.createElement("li");
    message.textContent = "No users match your filter.";
    usersList.append(message);
    return;
  }

  for (const user of list) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.append(name, email, city, company);
    usersList.append(li);
  }
}

// Filters the stored array (no new request) and redraws
function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter(user =>
    user.name.toLowerCase().includes(term)
  );
  renderUsers(matches);
}

loadBtn.addEventListener("click", loadUsers);

filterInput.addEventListener("input", function () {
  if (users.length === 0) {
    return; // nothing loaded yet
  }
  applyFilter();
});