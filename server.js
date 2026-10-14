
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const today = () => new Date().toISOString().slice(0, 10);

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { books: [], members: [], loans: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function overdueDays(loan) {
  if (!loan.returnDate && loan.dueDate < today()) {
    return Math.floor(
      (new Date(today()) - new Date(loan.dueDate)) / 86400000
    );
  }
  if (loan.returnDate && loan.returnDate > loan.dueDate) {
    return Math.floor(
      (new Date(loan.returnDate) - new Date(loan.dueDate)) / 86400000
    );
  }
  return 0;
}

// Add live overdue fine to each loan: Rs. 5 per day
function loanDetails(data, loan) {
  const book = data.books.find(b => b.id === loan.bookId);
  const member = data.members.find(m => m.id === loan.memberId);
  return {
    ...loan,
    bookTitle: book ? book.title : "Deleted book",
    memberName: member ? member.name : "Deleted member",
    overdueDays: overdueDays(loan),
    fine: overdueDays(loan) * 5
  };
}

// Dashboard
app.get("/api/dashboard", (req, res) => {
  const data = readData();
  const active = data.loans.filter(l => !l.returnDate);
  res.json({
    totalBooks: data.books.reduce((sum, b) => sum + b.quantity, 0),
    titles: data.books.length,
    members: data.members.length,
    issued: active.length,
    overdue: active.filter(l => l.dueDate < today()).length,
    fines: data.loans.reduce((sum, l) =>
      sum + loanDetails(data, l).fine, 0)
  });
});

// Books
app.get("/api/books", (req, res) => {
  const data = readData();
  const q = String(req.query.q || "").toLowerCase();
  res.json(data.books.filter(b =>
    `${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(q)
  ));
});

app.post("/api/books", (req, res) => {
  const { title, author, isbn = "", quantity = 1 } = req.body;
  const qty = Number(quantity);
  if (!String(title || "").trim() || !String(author || "").trim() ||
      !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: "Enter valid book details." });
  }

  const data = readData();
  const book = {
    id: nextId(data.books),
    title: String(title).trim(),
    author: String(author).trim(),
    isbn: String(isbn).trim(),
    quantity: qty,
    available: qty
  };
  data.books.push(book);
  saveData(data);
  res.status(201).json(book);
});

app.delete("/api/books/:id", (req, res) => {
  const data = readData();
  const id = Number(req.params.id);
  const book = data.books.find(b => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found." });
  if (data.loans.some(l => l.bookId === id && !l.returnDate)) {
    return res.status(400).json({ error: "Book has active issues." });
  }
  data.books = data.books.filter(b => b.id !== id);
  saveData(data);
  res.json({ message: "Book deleted." });
});

// Members
app.get("/api/members", (req, res) => {
  res.json(readData().members);
});

app.post("/api/members", (req, res) => {
  const { name, email, phone = "" } = req.body;
  if (!String(name || "").trim() || !String(email || "").trim()) {
    return res.status(400).json({ error: "Name and email are required." });
  }
  const data = readData();
  if (data.members.some(m =>
    m.email.toLowerCase() === String(email).trim().toLowerCase()
  )) {
    return res.status(400).json({ error: "Email already registered." });
  }
  const member = {
    id: nextId(data.members),
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone).trim()
  };
  data.members.push(member);
  saveData(data);
  res.status(201).json(member);
});

// Issue a book
app.post("/api/loans", (req, res) => {
  const bookId = Number(req.body.bookId);
  const memberId = Number(req.body.memberId);
  const data = readData();
  const book = data.books.find(b => b.id === bookId);
  const member = data.members.find(m => m.id === memberId);

  if (!book || !member) {
    return res.status(400).json({ error: "Select a valid book and member." });
  }
  if (book.available < 1) {
    return res.status(400).json({ error: "No copies available." });
  }
  if (data.loans.some(l =>
    l.bookId === bookId && l.memberId === memberId && !l.returnDate
  )) {
    return res.status(400).json({ error: "This member already has this book." });
  }

  const issueDate = today();
  const due = new Date();
  due.setDate(due.getDate() + 14);

  const loan = {
    id: nextId(data.loans),
    bookId,
    memberId,
    issueDate,
    dueDate: due.toISOString().slice(0, 10),
    returnDate: null
  };

  book.available--;
  data.loans.push(loan);
  saveData(data);
  res.status(201).json(loanDetails(data, loan));
});

// List all issue and return records
app.get("/api/loans", (req, res) => {
  const data = readData();
  res.json(data.loans.map(l => loanDetails(data, l)).reverse());
});

// Return a book
app.post("/api/loans/:id/return", (req, res) => {
  const data = readData();
  const loan = data.loans.find(l => l.id === Number(req.params.id));
  if (!loan) return res.status(404).json({ error: "Record not found." });
  if (loan.returnDate) {
    return res.status(400).json({ error: "Book already returned." });
  }

  loan.returnDate = today();
  const book = data.books.find(b => b.id === loan.bookId);
  if (book) book.available++;
  saveData(data);
  res.json(loanDetails(data, loan));
});

// Friendly error response
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error. Please try again." });
});

app.listen(PORT, () => {
  console.log(`Library Management System: http://localhost:${PORT}`);
});
