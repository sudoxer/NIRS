const tokenKey = "school_journal_token";

const state = {
  me: null,
  adminTeachers: [],
  activeTab: null,
  pendingGrades: new Map(),
};

const viewIds = ["student-view", "teacher-view", "admin-view"];

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

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tableHtml(headers, rows) {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table>${head}${body}</table></div>`;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  for (const id of viewIds) document.getElementById(id).classList.add("hidden");
  document.getElementById(`${tab}-view`).classList.remove("hidden");

  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
}

function setupTabs(role) {
  const tabs = [];
  if (role === "student") tabs.push({ id: "student", title: "Student" });
  if (["teacher", "vice_principal", "principal"].includes(role)) tabs.push({ id: "teacher", title: "Teacher" });
  if (["vice_principal", "principal"].includes(role)) tabs.push({ id: "admin", title: "Admin" });

  const tabEl = document.getElementById("tabs");
  tabEl.innerHTML = tabs
    .map((t) => `<button class="ghost" data-tab="${t.id}">${t.title}</button>`)
    .join("");

  tabEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  if (tabs.length) setActiveTab(tabs[0].id);
}

async function loadStudentView() {
  const block = document.getElementById("student-view");
  const [subjects, grades] = await Promise.all([api("/api/student/subjects"), api("/api/student/grades")]);

  const subjectNames = [...new Set(subjects.map((s) => s.subject_name))].sort();
  const dates = [...new Set(grades.map((g) => g.date))].sort();

  const matrix = new Map();
  grades.forEach((g) => {
    const key = `${g.date}|${g.subject_name}`;
    const prev = matrix.get(key);
    matrix.set(key, prev ? `${prev}, ${g.value}` : `${g.value}`);
  });

  const rows = dates.map((d) => [d, ...subjectNames.map((s) => matrix.get(`${d}|${s}`) || "—")]);

  block.innerHTML = `<h2>Student Dashboard</h2>
    <p class="small">Табель: строки — даты, столбцы — предметы.</p>
    ${tableHtml(["Date", ...subjectNames], rows)}`;
}

function teacherApiPath(path, teacherId) {
  if (!teacherId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}teacher_id=${teacherId}`;
}

async function loadTeacherView() {
  const block = document.getElementById("teacher-view");
  const isAdmin = ["vice_principal", "principal"].includes(state.me.role);
  state.pendingGrades = new Map();

  if (isAdmin && state.adminTeachers.length === 0) {
    state.adminTeachers = await api("/api/admin/teachers");
  }

  const teacherPicker = isAdmin
    ? `<label>Учитель
         <select id="teacher-picker">
           ${state.adminTeachers
             .map((t) => `<option value="${t.id}">${escapeHtml(t.last_name)} ${escapeHtml(t.first_name)} (#${t.id})</option>`)
             .join("")}
         </select>
       </label>`
    : `<label>Учитель <input value="Текущий пользователь" disabled /></label>`;

  block.innerHTML = `<h2>Teacher Dashboard</h2>
    <div class="tools">
      ${teacherPicker}
      <label>Класс / предмет <select id="assignment-select"></select></label>
      <label>Добавить дату <input type="date" id="new-date" /></label>
      <button id="add-date" class="ghost">Добавить дату в таблицу</button>
      <button id="load-gradebook">Открыть таблицу</button>
    </div>
    <p class="small">Формат табеля: строки — ученики, столбцы — даты. Нажмите на ячейку, чтобы ввести оценку.</p>
    <div id="gradebook"></div>
    <div class="tools">
      <button id="save-pending" class="hidden">Сохранить</button>
      <span id="grade-msg" class="small"></span>
    </div>`;

  const teacherId = () => (isAdmin ? Number(document.getElementById("teacher-picker").value) : null);

  let currentDates = [];
  let currentStudents = [];
  let currentGrades = [];

  function renderGradebook() {
    const selected = document.getElementById("assignment-select").value;
    if (!selected) {
      document.getElementById("gradebook").innerHTML = "";
      document.getElementById("save-pending").classList.add("hidden");
      return;
    }

    const [classId, subjectId] = selected.split("|").map(Number);
    const byCell = new Map();

    currentGrades.forEach((g) => {
      const key = `${g.student_id}|${g.date}`;
      const prev = byCell.get(key);
      byCell.set(key, prev ? `${prev}, ${g.value}` : `${g.value}`);
    });

    for (const [k, v] of state.pendingGrades.entries()) {
      const [cId, sId] = k.split("|").map(Number);
      if (cId === classId && sId === subjectId) {
        for (const item of v) {
          byCell.set(`${item.studentId}|${item.date}`, `${item.value}*`);
        }
      }
    }

    const header = `<tr><th>Ученик</th>${currentDates.map((d) => `<th>${escapeHtml(d)}</th>`).join("")}</tr>`;
    const rows = currentStudents
      .map((s) => {
        const cols = currentDates
          .map((d) => {
            const val = byCell.get(`${s.id}|${d}`) || "—";
            return `<td class="editable-cell" data-student-id="${s.id}" data-date="${d}">${escapeHtml(val)}</td>`;
          })
          .join("");
        return `<tr><td>${escapeHtml(`${s.last_name} ${s.first_name}`)} <span class="badge">#${s.id}</span></td>${cols}</tr>`;
      })
      .join("");

    document.getElementById("gradebook").innerHTML = `<div class="table-wrap"><table>${header}${rows}</table></div>`;
    document.getElementById("save-pending").classList.remove("hidden");

    document.querySelectorAll(".editable-cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        const studentId = Number(cell.dataset.studentId);
        const d = cell.dataset.date;
        const nextVal = prompt(`Оценка для ученика #${studentId} на ${d} (1-12)`);
        if (nextVal === null) return;
        const value = Number(nextVal);
        if (!Number.isInteger(value) || value < 1 || value > 12) {
          document.getElementById("grade-msg").textContent = "Оценка должна быть целым числом 1..12";
          return;
        }

        const key = `${classId}|${subjectId}`;
        const arr = state.pendingGrades.get(key) || [];
        const idx = arr.findIndex((x) => x.studentId === studentId && x.date === d);
        const item = { studentId, date: d, value };
        if (idx >= 0) arr[idx] = item;
        else arr.push(item);
        state.pendingGrades.set(key, arr);

        cell.textContent = `${value}*`;
        cell.classList.add("pending-cell");
        document.getElementById("grade-msg").textContent = "Есть несохраненные изменения";
      });
    });
  }

  async function loadAssignments() {
    const classes = await api(teacherApiPath("/api/teacher/classes", teacherId()));
    const select = document.getElementById("assignment-select");
    select.innerHTML = classes
      .map((c) => `<option value="${c.class_id}|${c.subject_id}">${escapeHtml(c.display_name)} / ${escapeHtml(c.subject_name)}</option>`)
      .join("");
  }

  async function loadGradebook() {
    const selected = document.getElementById("assignment-select").value;
    if (!selected) return;

    const [classId, subjectId] = selected.split("|").map(Number);

    const [students, grades] = await Promise.all([
      api(teacherApiPath(`/api/teacher/classes/${classId}/students`, teacherId())),
      api(teacherApiPath(`/api/teacher/classes/${classId}/grades?subject_id=${subjectId}`, teacherId())),
    ]);

    currentStudents = students;
    currentGrades = grades;
    currentDates = [...new Set(grades.map((g) => g.date))].sort();
    renderGradebook();
  }

  async function savePending() {
    const selected = document.getElementById("assignment-select").value;
    if (!selected) return;
    const [classId, subjectId] = selected.split("|").map(Number);
    const key = `${classId}|${subjectId}`;
    const pending = state.pendingGrades.get(key) || [];

    if (!pending.length) {
      document.getElementById("grade-msg").textContent = "Нет изменений для сохранения";
      return;
    }

    let saved = 0;
    for (const item of pending) {
      await api(teacherApiPath("/api/teacher/grades", teacherId()), {
        method: "POST",
        body: JSON.stringify({
          student_id: item.studentId,
          class_id: classId,
          subject_id: subjectId,
          value: item.value,
          date: item.date,
          comment: null,
        }),
      });
      saved += 1;
    }

    state.pendingGrades.set(key, []);
    document.getElementById("grade-msg").textContent = `Сохранено: ${saved}`;
    await loadGradebook();
  }

  document.getElementById("load-gradebook").addEventListener("click", loadGradebook);
  document.getElementById("save-pending").addEventListener("click", savePending);

  document.getElementById("add-date").addEventListener("click", () => {
    const d = document.getElementById("new-date").value;
    if (!d) return;
    if (!currentDates.includes(d)) {
      currentDates.push(d);
      currentDates.sort();
      renderGradebook();
    }
  });

  if (isAdmin) {
    document.getElementById("teacher-picker").addEventListener("change", async () => {
      state.pendingGrades = new Map();
      currentDates = [];
      currentStudents = [];
      currentGrades = [];
      document.getElementById("gradebook").innerHTML = "";
      document.getElementById("grade-msg").textContent = "";
      await loadAssignments();
    });
  }

  await loadAssignments();
}

function initAdminInnerTabs() {
  const tabButtons = document.querySelectorAll("#admin-inner-tabs button");
  const panes = document.querySelectorAll(".admin-pane");

  const activate = (tab) => {
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.innerTab === tab));
    panes.forEach((p) => p.classList.toggle("hidden", p.dataset.innerPane !== tab));
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.innerTab));
  });

  if (tabButtons.length) activate(tabButtons[0].dataset.innerTab);
}

async function loadAdminView() {
  const block = document.getElementById("admin-view");
  const [students, teachers, subjects, classes, grades] = await Promise.all([
    api("/api/admin/students"),
    api("/api/admin/teachers"),
    api("/api/admin/subjects"),
    api("/api/admin/classes"),
    api("/api/admin/grades"),
  ]);

  block.innerHTML = `<h2>Administration Dashboard</h2>
    <div class="tools">
      <span class="badge">Students: ${students.length}</span>
      <span class="badge">Teachers: ${teachers.length}</span>
      <span class="badge">Subjects: ${subjects.length}</span>
      <span class="badge">Classes: ${classes.length}</span>
      <span class="badge">Grades: ${grades.length}</span>
    </div>

    <nav id="admin-inner-tabs" class="tabs inner-tabs">
      <button class="ghost" data-inner-tab="teachers">Teachers</button>
      <button class="ghost" data-inner-tab="students">Students</button>
      <button class="ghost" data-inner-tab="classes">Classes</button>
      <button class="ghost" data-inner-tab="subjects">Subjects</button>
      <button class="ghost" data-inner-tab="grades">Grades</button>
    </nav>

    <section class="admin-pane" data-inner-pane="teachers">
      <h3>All Teachers</h3>
      ${tableHtml(["Teacher ID", "First", "Last", "User ID"], teachers.map((t) => [t.id, t.first_name, t.last_name, t.user_id]))}
    </section>

    <section class="admin-pane hidden" data-inner-pane="students">
      <h3>All Students</h3>
      ${tableHtml(["Student ID", "First", "Last", "Class ID"], students.map((s) => [s.id, s.first_name, s.last_name, s.class_id]))}
    </section>

    <section class="admin-pane hidden" data-inner-pane="classes">
      <h3>All Classes</h3>
      ${tableHtml(["Class ID", "Display", "Grade", "Letter"], classes.map((c) => [c.id, c.display_name, c.grade_level, c.letter]))}
    </section>

    <section class="admin-pane hidden" data-inner-pane="subjects">
      <h3>All Subjects</h3>
      ${tableHtml(["Subject ID", "Name"], subjects.map((s) => [s.id, s.name]))}
    </section>

    <section class="admin-pane hidden" data-inner-pane="grades">
      <h3>All Grades</h3>
      ${tableHtml(
        ["Grade ID", "Student", "Class", "Subject", "Teacher", "Value", "Date"],
        grades.map((g) => [g.id, g.student_id, g.class_id, g.subject_name, g.teacher_name, g.value, g.date])
      )}
    </section>`;

  initAdminInnerTabs();
}

async function loadApp() {
  state.me = await api("/api/me");
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  profileEl.textContent = `${state.me.username} (${state.me.role})`;

  setupTabs(state.me.role);

  if (state.me.role === "student") await loadStudentView();
  if (["teacher", "vice_principal", "principal"].includes(state.me.role)) await loadTeacherView();
  if (["vice_principal", "principal"].includes(state.me.role)) await loadAdminView();
}

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

(async () => {
  if (localStorage.getItem(tokenKey)) {
    try {
      await loadApp();
    } catch {
      localStorage.removeItem(tokenKey);
    }
  }
})();
