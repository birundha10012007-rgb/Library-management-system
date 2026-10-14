
const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch("/api" + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function showMessage(message, error = false) {
  $("message").innerHTML =
    `<div class="${error ? "error" : "notice"}">${escapeHTML(message)}</div>`;
  window.setTimeout(() => {
    $("message").innerHTML = "";
  }, 4000);
}

async function action(callback) {
  try {
    await callback();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("hidden", section.id !== page);
  });

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const titles = {
    dashboard: "Dashboard",
    books: "Books",
    members: "Members",
    issue: "Issue / Return",
    records: "Records & Fines"
  };

  $("page-title").textContent = titles[page] || "Dashboard";
  action(loadAll);
}

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

async function loadDashboard() {
  const data = await api("/dashboard");
  $("totalBooks").textContent = data.totalBooks;
  $("titles").textContent = data.titles;
  $("membersCount").textContent = data.members;
  $("issued").textContent = data.issued;
  $("overdue").textContent = data.overdue;
  $("fines").textContent = "₹" + data.fines;
}

async function loadBooks() {
  const q = encodeURIComponent($("bookSearch").value.trim());
  const books = await api("/books?q=" + q);

  $("bookRows").innerHTML = books.length ? books.map(book => `
    <tr>
      <td>${book.id}</td>
      <td>${escapeHTML(book.title)}</td>
      <td>${escapeHTML(book.author)}</td>
      <td>${escapeHTML(book.isbn || "-")}</td>
      <td>${book.quantity}</td>
      <td>${book.available}</td>
      <td><button data-delete-book="${book.id}">Delete</button></td>
    </tr>
  `).join("") : '<tr><td colspan="7">No books found.</td></tr>';

  $("bookSelect").innerHTML =
    '<option value="">Select book</option>' +
    books.filter(b => b.available > 0).map(b =>
      `<option value="${b.id}">${escapeHTML(b.title)} (${b.available} available)</option>`
    ).join("");
}

async function loadMembers() {
  const members = await api("/members");

  $("memberRows").innerHTML = members.length ? members.map(member => `
    <tr>
      <td>${member.id}</td>
      <td>${escapeHTML(member.name)}</td>
      <td>${escapeHTML(member.email)}</td>
      <td>${escapeHTML(member.phone || "-")}</td>
    </tr>
  `).join("") : '<tr><td colspan="4">No members yet.</td></tr>';

  $("memberSelect").innerHTML =
    '<option value="">Select member</option>' +
    members.map(m =>
      `<option value="${m.id}">${escapeHTML(m.name)}</option>`
    ).join("");
}

async function loadLoans() {
  const loans = await api("/loans");
  const active = loans.filter(l => !l.returnDate);

  $("activeRows").innerHTML = active.length ? active.map(l => `
    <tr>
      <td>${escapeHTML(l.bookTitle)}</td>
      <td>${escapeHTML(l.memberName)}</td>
      <td>${l.issueDate}</td>
      <td>${l.dueDate}</td>
      <td>₹${l.fine}</td>
      <td><button data-return="${l.id}">Return Book</button></td>
    </tr>
  `).join("") : '<tr><td colspan="6">No active issues.</td></tr>';

  $("recordRows").innerHTML = loans.length ? loans.map(l => `
    <tr>
      <td>${escapeHTML(l.bookTitle)}</td>
      <td>${escapeHTML(l.memberName)}</td>
      <td>${l.issueDate}</td>
      <td>${l.dueDate}</td>
      <td>${l.returnDate || "-"}</td>
      <td>₹${l.fine}</td>
      <td>${l.returnDate ? "Returned" : l.overdueDays ? "Overdue" : "Issued"}</td>
    </tr>
  `).join("") : '<tr><td colspan="7">No issue records yet.</td></tr>';
}

async function loadAll() {
  await Promise.all([
    loadDashboard(), loadBooks(), loadMembers(), loadLoans()
  ]);
}

// Add a book
$("bookForm").addEventListener("submit", event => {
  event.preventDefault();
  action(async () => {
    const form = new FormData(event.target);
    await api("/books", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        author: form.get("author"),
        isbn: form.get("isbn"),
        quantity: Number(form.get("quantity"))
      })
    });
    event.target.reset();
    showMessage("Book added successfully!");
    await loadAll();
  });
});

// Search books
$("bookSearch").addEventListener("input", () => action(loadBooks));

// Delete a book
$("bookRows").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-book]");
  if (!button) return;

  if (!confirm("Delete this book?")) return;

  action(async () => {
    await api("/books/" + button.dataset.deleteBook, {
      method: "DELETE"
    });
    showMessage("Book deleted.");
    await loadAll();
  });
});

// Register a member
$("memberForm").addEventListener("submit", event => {
  event.preventDefault();
  action(async () => {
    const form = new FormData(event.target);
    await api("/members", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone")
      })
    });
    event.target.reset();
    showMessage("Member registered successfully!");
    await loadAll();
  });
});

// Issue a book
$("issueForm").addEventListener("submit", event => {
  event.preventDefault();
  action(async () => {
    const form = new FormData(event.target);
    await api("/loans", {
      method: "POST",
      body: JSON.stringify({
        bookId: Number(form.get("bookId")),
        memberId: Number(form.get("memberId"))
      })
    });
    event.target.reset();
    showMessage("Book issued! Due date is 14 days from issue.");
    await loadAll();
  });
});

// Return a book
$("activeRows").addEventListener("click", event => {
  const button = event.target.closest("[data-return]");
  if (!button) return;

  if (!confirm("Confirm book return?")) return;

  action(async () => {
    const result = await api("/loans/" + button.dataset.return + "/return", {
      method: "POST",
      body: JSON.stringify({})
    });
    showMessage("Book returned. Fine: ₹" + result.fine);
    await loadAll();
  });
});

loadAll();
