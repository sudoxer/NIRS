const tokenKey = "school_journal_token";

const api = async (path, options = {}) => {
  const token = localStorage.getItem(tokenKey);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return res.json();
};

const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const profileEl = document.getElementById("profile");

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  try {
    const { token } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    localStorage.setItem(tokenKey, token);
    document.getElementById("login-error").textContent = "";
    await loadApp();
  } catch (err) {
    document.getElementById("login-error").textContent = err.message;
  }
});

document.getElementById("logout").addEventListener("click", () => {
  localStorage.removeItem(tokenKey);
  location.reload();
});

function tableHtml(headers, rows) {
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
  return `<table>${head}${body}</table>`;
}

async function loadStudentView() {
  const block = document.getElementById("student-view");
  block.classList.remove("hidden");
  const [subjects, grades] = await Promise.all([api("/api/student/subjects"), api("/api/student/grades")]);
  block.innerHTML = `<h2>Student Dashboard</h2>
    <h3>Subjects</h3>
    <ul>${subjects.map((s) => `<li>${s.subject_name}</li>`).join("")}</ul>
    <h3>Grades</h3>
    ${tableHtml(["Date", "Subject", "Teacher", "Value", "Comment"], grades.map((g) => [g.date, g.subject_name, g.teacher_name, g.value, g.comment]))}`;
}

async function loadTeacherView() {
  const block = document.getElementById("teacher-view");
  block.classList.remove("hidden");

  const classes = await api("/api/teacher/classes");
  block.innerHTML = `<h2>Teacher Dashboard</h2>
    <h3>Assignments</h3>
    ${tableHtml(["Class", "Subject"], classes.map((c) => [c.display_name, c.subject_name]))}
    <h3>Show class grades</h3>
    <label>Class: <select id="class-select">${classes.map((c) => `<option value="${c.class_id}|${c.subject_id}">${c.display_name} / ${c.subject_name}</option>`).join("")}</select></label>
    <button id="load-grades">Load</button>
    <div id="teacher-grades"></div>
    <h3>Add grade</h3>
    <form id="grade-form">
      <label>Student ID <input id="g-student" required type="number" /></label>
      <label>Class ID <input id="g-class" required type="number" /></label>
      <label>Subject ID <input id="g-subject" required type="number" /></label>
      <label>Value <input id="g-value" required type="number" min="1" max="12" /></label>
      <label>Date <input id="g-date" required type="date" /></label>
      <label>Comment <input id="g-comment" /></label>
      <button type="submit">Create</button>
    </form>
    <p id="grade-msg"></p>`;

  document.getElementById("load-grades").addEventListener("click", async () => {
    const val = document.getElementById("class-select").value;
    const [classId, subjectId] = val.split("|");
    const grades = await api(`/api/teacher/classes/${classId}/grades?subject_id=${subjectId}`);
    document.getElementById("teacher-grades").innerHTML = tableHtml(
      ["Student ID", "Date", "Value", "Comment"],
      grades.map((g) => [g.student_id, g.date, g.value, g.comment])
    );
  });

  document.getElementById("grade-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/teacher/grades", {
        method: "POST",
        body: JSON.stringify({
          student_id: Number(document.getElementById("g-student").value),
          class_id: Number(document.getElementById("g-class").value),
          subject_id: Number(document.getElementById("g-subject").value),
          value: Number(document.getElementById("g-value").value),
          date: document.getElementById("g-date").value,
          comment: document.getElementById("g-comment").value || null,
        }),
      });
      document.getElementById("grade-msg").textContent = "Grade created";
    } catch (e1) {
      document.getElementById("grade-msg").textContent = e1.message;
    }
  });
}

async function loadAdminView() {
  const block = document.getElementById("admin-view");
  block.classList.remove("hidden");
  const [students, teachers, subjects, classes, grades] = await Promise.all([
    api("/api/admin/students"),
    api("/api/admin/teachers"),
    api("/api/admin/subjects"),
    api("/api/admin/classes"),
    api("/api/admin/grades"),
  ]);

  block.innerHTML = `<h2>Administration Dashboard</h2>
    <h3>Students</h3>${tableHtml(["ID", "First", "Last", "Class"], students.map((s) => [s.id, s.first_name, s.last_name, s.class_id]))}
    <h3>Teachers</h3>${tableHtml(["ID", "First", "Last", "User ID"], teachers.map((t) => [t.id, t.first_name, t.last_name, t.user_id]))}
    <h3>Subjects</h3>${tableHtml(["ID", "Name"], subjects.map((s) => [s.id, s.name]))}
    <h3>Classes</h3>${tableHtml(["ID", "Display", "Grade", "Letter"], classes.map((c) => [c.id, c.display_name, c.grade_level, c.letter]))}
    <h3>Grades</h3>${tableHtml(["ID", "Student", "Class", "Subject", "Teacher", "Value", "Date"], grades.map((g) => [g.id, g.student_id, g.class_id, g.subject_name, g.teacher_name, g.value, g.date]))}`;
}

async function loadApp() {
  const me = await api("/api/me");
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  profileEl.textContent = `${me.username} (${me.role})`;

  if (me.role === "student") await loadStudentView();
  if (["teacher", "vice_principal", "principal"].includes(me.role)) await loadTeacherView();
  if (["vice_principal", "principal"].includes(me.role)) await loadAdminView();
}

(async () => {
  if (localStorage.getItem(tokenKey)) {
    try {
      await loadApp();
    } catch {
      localStorage.removeItem(tokenKey);
    }
  }
})();
