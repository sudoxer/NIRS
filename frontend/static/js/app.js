const tokenKey = "school_journal_token";

const state = {
  me: null,
  adminTeachers: [],
  activeTab: null,
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

  if (isAdmin && state.adminTeachers.length === 0) {
    state.adminTeachers = await api("/api/admin/teachers");
  }

  const teacherSelect = isAdmin
    ? `<label>Teacher
         <select id="teacher-picker">
           ${state.adminTeachers.map((t) => `<option value="${t.id}">${escapeHtml(t.last_name)} ${escapeHtml(t.first_name)} (#${t.id})</option>`).join("")}
         </select>
       </label>`
    : "";

  block.innerHTML = `<h2>Teacher Dashboard</h2>
    <div class="tools">
      ${teacherSelect}
      <label>Class / Subject <select id="assignment-select"></select></label>
      <label>Date for new grades <input type="date" id="grade-date" /></label>
      <button id="load-gradebook">Load gradebook</button>
    </div>
    <p class="small">Табель: строки — ученики, столбцы — даты. В последнем столбце можно выставить новую оценку на выбранную дату.</p>
    <div id="gradebook"></div>
    <p id="grade-msg" class="small"></p>`;

  const teacherId = () => (isAdmin ? Number(document.getElementById("teacher-picker").value) : null);

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

    const dates = [...new Set(grades.map((g) => g.date))].sort();
    const byCell = new Map();
    grades.forEach((g) => {
      const key = `${g.student_id}|${g.date}`;
      const prev = byCell.get(key);
      byCell.set(key, prev ? `${prev}, ${g.value}` : `${g.value}`);
    });

    const thead = `<tr><th>Student</th>${dates.map((d) => `<th>${escapeHtml(d)}</th>`).join("")}<th>New grade</th><th></th></tr>`;
    const rows = students
      .map(
        (s) => `<tr>
          <td>${escapeHtml(`${s.last_name} ${s.first_name}`)} <span class="badge">#${s.id}</span></td>
          ${dates.map((d) => `<td>${escapeHtml(byCell.get(`${s.id}|${d}`) || "—")}</td>`).join("")}
          <td class="grade-cell"><input type="number" min="1" max="12" data-student-id="${s.id}" placeholder="1-12" /></td>
          <td><button data-save-student-id="${s.id}" data-class-id="${classId}" data-subject-id="${subjectId}">Save</button></td>
        </tr>`
      )
      .join("");

    document.getElementById("gradebook").innerHTML = `<div class="table-wrap"><table>${thead}${rows}</table></div>`;

    document.querySelectorAll("button[data-save-student-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const studentId = Number(btn.dataset.saveStudentId);
        const cId = Number(btn.dataset.classId);
        const sId = Number(btn.dataset.subjectId);
        const valueInput = document.querySelector(`input[data-student-id='${studentId}']`);
        const gradeDate = document.getElementById("grade-date").value;
        const value = Number(valueInput.value);

        if (!gradeDate) {
          document.getElementById("grade-msg").textContent = "Pick date before saving";
          return;
        }
        if (!value || value < 1 || value > 12) {
          document.getElementById("grade-msg").textContent = "Grade value must be between 1 and 12";
          return;
        }

        try {
          await api(teacherApiPath("/api/teacher/grades", teacherId()), {
            method: "POST",
            body: JSON.stringify({
              student_id: studentId,
              class_id: cId,
              subject_id: sId,
              value,
              date: gradeDate,
              comment: null,
            }),
          });
          document.getElementById("grade-msg").textContent = `Saved for student #${studentId}`;
          valueInput.value = "";
          await loadGradebook();
        } catch (e) {
          document.getElementById("grade-msg").textContent = e.message;
        }
      });
    });
  }

  if (isAdmin) {
    document.getElementById("teacher-picker").addEventListener("change", async () => {
      await loadAssignments();
      document.getElementById("gradebook").innerHTML = "";
    });
  }

  document.getElementById("load-gradebook").addEventListener("click", loadGradebook);

  await loadAssignments();
}

async function loadAdminView() {
  const block = document.getElementById("admin-view");
  const [students, teachers, subjects, classes] = await Promise.all([
    api("/api/admin/students"),
    api("/api/admin/teachers"),
    api("/api/admin/subjects"),
    api("/api/admin/classes"),
  ]);

  block.innerHTML = `<h2>Administration Dashboard</h2>
    <div class="tools">
      <span class="badge">Students: ${students.length}</span>
      <span class="badge">Teachers: ${teachers.length}</span>
      <span class="badge">Subjects: ${subjects.length}</span>
      <span class="badge">Classes: ${classes.length}</span>
    </div>
    ${tableHtml(["Teacher ID", "First", "Last", "User ID"], teachers.slice(0, 30).map((t) => [t.id, t.first_name, t.last_name, t.user_id]))}
    <p class="small">Показаны первые 30 учителей для компактности. Полный список доступен через API /api/admin/teachers.</p>`;
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
