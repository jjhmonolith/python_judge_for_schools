(async () => {
  let problems = [];
  const $ = (selector) => document.querySelector(selector);
  const list = $("#problem-list");
  const editor = $("#code-editor");
  const resultPanel = $("#result-panel");
  const submitButton = $("#submit-button");
  const sampleButton = $("#sample-button");
  const storageKey = "code-practice-judge-v1";
  let saved = loadProgress();
  let currentIndex = 0;
  let toastTimer;
  let activeWorker;
  let judgeBusy = false;
  let currentAccount = null;
  let cloudSaveTimer;
  let isHydrating = false;
  let accountRole = "student";
  let cloudErrorShown = false;
  let lastTutorRun = null;
  const tutorHintLevels = {};
  let tutorBusy = false;
  let tutorController = null;
  let teacherProblems = [];
  let editingProblemId = null;

  function loadProgress(key = storageKey) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }

  function addProblemTestRow(test = {}) {
    const row = document.createElement("div");
    row.className = "problem-test-row";
    const inputLabel = document.createElement("label");
    inputLabel.textContent = "테스트 입력";
    const input = document.createElement("textarea");
    input.className = "teacher-textarea";
    input.dataset.testInput = "true";
    input.rows = 3;
    input.value = test.input || "";
    inputLabel.append(input);
    const outputLabel = document.createElement("label");
    outputLabel.textContent = "기대 출력";
    const output = document.createElement("textarea");
    output.className = "teacher-textarea";
    output.dataset.testOutput = "true";
    output.rows = 3;
    output.value = test.output || "";
    outputLabel.append(output);
    const remove = document.createElement("button");
    remove.className = "problem-test-remove";
    remove.type = "button";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      if (document.querySelectorAll(".problem-test-row").length > 1) row.remove();
    });
    row.append(inputLabel, outputLabel, remove);
    $("#problem-test-list").append(row);
  }

  function clearTeacherProblemForm() {
    editingProblemId = null;
    $("#teacher-problem-form").reset();
    $("#teacher-problem-form-title").textContent = "새 문제 추가";
    $("#teacher-problem-submit").textContent = "문제 추가";
    $("#teacher-problem-cancel").hidden = true;
    $("#problem-published-input").checked = true;
    $("#problem-test-list").innerHTML = "";
    addProblemTestRow();
  }

  function editTeacherProblem(problemId) {
    const problem = teacherProblems.find((entry) => entry.id === problemId);
    if (!problem) return;
    editingProblemId = problem.id;
    $("#teacher-problem-form-title").textContent = `문제 수정: ${problem.title}`;
    $("#teacher-problem-submit").textContent = "수정 저장";
    $("#teacher-problem-cancel").hidden = false;
    $("#problem-title-input").value = problem.title;
    $("#problem-difficulty-input").value = problem.difficulty;
    $("#problem-tags-input").value = (problem.tags || []).join(", ");
    $("#problem-description-input").value = problem.description;
    $("#problem-input-description").value = problem.input;
    $("#problem-output-description").value = problem.output;
    $("#problem-sample-input").value = problem.sampleInput;
    $("#problem-sample-output").value = problem.sampleOutput;
    $("#problem-hint-input").value = problem.hint;
    $("#problem-starter-input").value = problem.starter;
    $("#problem-answer-input").value = problem.answer;
    $("#problem-published-input").checked = problem.published;
    $("#problem-test-list").innerHTML = "";
    problem.tests.forEach(addProblemTestRow);
    $("#teacher-problem-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderTeacherProblems(items) {
    teacherProblems = items;
    $("#teacher-problem-count").textContent = `${items.length}개`;
    $("#teacher-problem-list").innerHTML = items.length
      ? sortedTeacherProblems(items).map((problem) => `<article class="teacher-problem-card"><div><strong>${escapeHtml(problem.title)}</strong><small>${problem.published ? "공개 중" : "비공개"} · 테스트 ${problem.tests.length}개 · ${escapeHtml(problem.difficulty)}</small></div><div class="teacher-problem-actions"><button type="button" data-edit-problem="${escapeHtml(problem.id)}">수정</button><button type="button" data-toggle-problem="${escapeHtml(problem.id)}">${problem.published ? "비공개" : "공개"}</button><button type="button" data-delete-problem="${escapeHtml(problem.id)}">삭제</button></div></article>`).join("")
      : '<p class="teacher-empty">등록된 문제가 없어요. 아래에서 새 문제를 추가해 주세요.</p>';
  }

  function sortedTeacherProblems(items) {
    return [...items].sort((left, right) => left.order - right.order);
  }

  async function refreshStudentProblems() {
    const currentId = problems[currentIndex]?.id || saved.currentProblemId;
    const data = await apiRequest("/api/problems");
    problems = data.problems;
    currentIndex = findProblemIndex(currentId);
    if (!problems.some((problem) => problem.id === currentId)) {
      currentIndex = findProblemIndex(saved.currentProblemId);
    }
    renderList();
    renderProblem();
    updateProgress();
  }

  function normalizeProgress(progress) {
    const normalized = { ...progress };
    if (!Array.isArray(normalized.solvedIds)) {
      normalized.solvedIds = (normalized.solved || []).map((index) => problems[index]?.id).filter(Boolean);
    }
    if (!normalized.currentProblemId && Number.isInteger(normalized.current)) {
      normalized.currentProblemId = problems[normalized.current]?.id || null;
    }
    normalized.codes = Object.fromEntries(Object.entries(normalized.codes || {}).map(([key, code]) => {
      const id = /^\d+$/.test(key) ? problems[Number(key)]?.id : key;
      return [id || key, code];
    }));
    delete normalized.current;
    delete normalized.solved;
    return normalized;
  }

  function findProblemIndex(problemId) {
    const index = problems.findIndex((problem) => problem.id === problemId);
    return index < 0 ? 0 : index;
  }

  async function loadProblemList() {
    const data = await apiRequest("/api/problems");
    problems = data.problems;
    saved = normalizeProgress(saved);
    currentIndex = findProblemIndex(saved.currentProblemId);
    renderList();
    renderProblem();
  }

  async function loadProblemList() {
    const data = await apiRequest("/api/problems");
    problems = data.problems;
    saved = normalizeProgress(saved);
    currentIndex = findProblemIndex(saved.currentProblemId);
    renderList();
    renderProblem();
  }

  function progressStorageKey() {
    return currentAccount?.role === "student" ? `${storageKey}:${currentAccount.id}` : storageKey;
  }

  function persist() {
    saved.currentProblemId = problems[currentIndex]?.id || null;
    localStorage.setItem(progressStorageKey(), JSON.stringify(saved));
    updateProgress();
    if (currentAccount?.role === "student" && !isHydrating) scheduleCloudSave();
  }

  function scheduleCloudSave() {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(saveCloudProgress, 700);
  }

  async function saveCloudProgress() {
    if (currentAccount?.role !== "student") return;
    try {
      await apiRequest("/api/student/progress", {
        method: "PUT",
        body: JSON.stringify({
          currentProblemId: problems[currentIndex]?.id || null,
          solvedIds: saved.solvedIds || [],
          codes: saved.codes || {}
        })
      });
      cloudErrorShown = false;
    } catch {
      if (!cloudErrorShown) showToast("온라인 저장에 실패했어요. 다시 로그인해 주세요.");
      cloudErrorShown = true;
    }
  }

  async function activateStudent(profile) {
    currentAccount = profile;
    updateAccountButton();

    let data;
    try {
      data = await apiRequest("/api/student/progress");
    } catch {
      currentAccount = null;
      updateAccountButton();
      setAccountNote("학생 학습 기록을 불러오지 못했어요. 다시 로그인해 주세요.");
      return false;
    }

    isHydrating = true;
    const localProgress = normalizeProgress(loadProgress(progressStorageKey()));
    saved = {
      currentProblemId: data.currentProblemId || localProgress.currentProblemId || null,
      solvedIds: [...new Set([...(localProgress.solvedIds || []), ...(data.solvedIds || [])])],
      codes: { ...(localProgress.codes || {}), ...(data.codes || {}) }
    };
    currentIndex = findProblemIndex(saved.currentProblemId);
    localStorage.setItem(progressStorageKey(), JSON.stringify(saved));
    renderProblem();
    isHydrating = false;
    await saveCloudProgress();
    return true;
  }

  function updateAccountButton() {
    const button = $("#account-button");
    button.textContent = currentAccount?.role === "teacher" ? "선생님 관리" : currentAccount ? "로그아웃" : "로그인";
    button.setAttribute("aria-label", currentAccount ? `${currentAccount.username} ${currentAccount.role === "teacher" ? "선생님 관리" : "로그아웃"}` : "학생 또는 선생님 로그인");
    $("#save-location").innerHTML = currentAccount?.role === "student"
      ? '기록은 계정에 자동 저장됩니다 <span class="save-check">✓</span>'
      : '기록은 이 기기에 자동 저장됩니다 <span class="save-check">✓</span>';
  }

  async function startAuth() {
    try {
      const account = await apiRequest("/api/auth/me");
      if (!account.authenticated) return;
      if (account.role === "student") await activateStudent(account);
      else {
        currentAccount = account;
        updateAccountButton();
      }
    } catch { /* No active session is the normal guest state. */ }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "요청을 처리하지 못했어요.");
    return data;
  }

  function setAccountNote(message) {
    $("#account-note").textContent = message;
  }

  function setAccountRole(role) {
    accountRole = role;
    const isTeacher = role === "teacher";
    $("#student-role-button").classList.toggle("active", !isTeacher);
    $("#teacher-role-button").classList.toggle("active", isTeacher);
    $("#student-role-button").setAttribute("aria-pressed", String(!isTeacher));
    $("#teacher-role-button").setAttribute("aria-pressed", String(isTeacher));
    $("#account-title").textContent = isTeacher ? "선생님 로그인" : "학생 로그인";
    $("#account-description").textContent = isTeacher
      ? "선생님 계정으로 학생들의 학습 현황을 확인하세요."
      : "아이디와 6자리 PIN으로 학습 기록을 이어가세요.";
    $("#account-submit").textContent = isTeacher ? "선생님으로 로그인" : "학생으로 로그인";
    setAccountNote(isTeacher
      ? "선생님 계정은 학생 계정과 별도로 관리됩니다."
      : "학생 계정은 선생님이 만들어 드려요. PIN을 잊으면 선생님께 초기화를 요청하세요.");
  }

  async function submitAccountForm(event) {
    event.preventDefault();
    $("#account-submit").disabled = true;
    setAccountNote("로그인하고 있어요...");
    try {
      const account = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          role: accountRole,
          username: $("#account-username").value.trim().toLowerCase(),
          pin: $("#account-pin").value.trim()
        })
      });
      if (account.role === "student") {
        if (!await activateStudent(account)) return;
        $("#account-dialog").close();
        showToast("학생 계정으로 로그인했어요.");
      } else {
        currentAccount = account;
        saved = { currentProblemId: problems[0]?.id || null, solvedIds: [], codes: {} };
        currentIndex = 0;
        renderProblem();
        updateAccountButton();
        $("#account-dialog").close();
        await loadTeacherDashboard();
        $("#teacher-dialog").showModal();
        showToast("선생님 계정으로 로그인했어요.");
      }
    } catch (error) {
      setAccountNote(error.message);
    } finally {
      $("#account-submit").disabled = false;
    }
  }

  async function logoutAccount() {
    const wasTeacher = currentAccount?.role === "teacher";
    if (currentAccount?.role === "student") {
      clearTimeout(cloudSaveTimer);
      await saveCloudProgress();
    }
    try { await apiRequest("/api/auth/logout", { method: "POST", body: "{}" }); }
    catch { /* Local state is cleared even if the server is unavailable. */ }
    currentAccount = null;
    saved = normalizeProgress(loadProgress());
    currentIndex = findProblemIndex(saved.currentProblemId);
    if ($("#teacher-dialog").open) $("#teacher-dialog").close();
    if (wasTeacher) {
      teacherProblems = [];
      $("#teacher-problem-list").innerHTML = "";
      clearTeacherProblemForm();
    }
    renderProblem();
    updateAccountButton();
    showToast("로그아웃했어요.");
  }

  async function loadTeacherDashboard() {
    let teacherProblems = [];
    try {
      const [{ students }, problemData] = await Promise.all([
        apiRequest("/api/teacher/students"),
        apiRequest("/api/teacher/problems")
      ]);
      teacherProblems = problemData.problems;
      $("#teacher-count").textContent = `${students.length}명`;
      $("#teacher-student-list").innerHTML = students.length
        ? students.map((student) => {
          const percent = Math.round(student.solvedCount / Math.max(1, student.totalProblems) * 100);
          const activity = student.updatedAt ? new Date(student.updatedAt).toLocaleString("ko-KR") : "아직 풀이 기록이 없어요";
          return `<article class="teacher-student-card"><div class="teacher-student-top"><div><strong>${escapeHtml(student.username)}</strong><span>${student.solvedCount} / ${student.totalProblems} 공개 문제 완료</span></div><button type="button" data-reset-student="${escapeHtml(student.id)}" data-reset-username="${escapeHtml(student.username)}">PIN 초기화</button></div><div class="teacher-progress"><span style="width:${percent}%"></span></div><small>최근 학습: ${escapeHtml(activity)}</small></article>`;
        }).join("")
        : '<p class="teacher-empty">학생 계정이 없어요. 아래에서 추가해 주세요.</p>';
    } catch (error) {
      $("#teacher-student-list").innerHTML = `<p class="teacher-empty">${escapeHtml(error.message)}</p>`;
    }
    renderTeacherProblems(teacherProblems);
  }

  async function saveTeacherProblem(event) {
    event.preventDefault();
    const submit = $("#teacher-problem-submit");
    submit.disabled = true;
    const problem = {
      title: $("#problem-title-input").value.trim(),
      difficulty: $("#problem-difficulty-input").value,
      tags: $("#problem-tags-input").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      description: $("#problem-description-input").value,
      input: $("#problem-input-description").value,
      output: $("#problem-output-description").value,
      sampleInput: $("#problem-sample-input").value,
      sampleOutput: $("#problem-sample-output").value,
      hint: $("#problem-hint-input").value,
      starter: $("#problem-starter-input").value,
      answer: $("#problem-answer-input").value,
      tests: [...document.querySelectorAll(".problem-test-row")].map((row) => ({
        input: row.querySelector("[data-test-input]").value,
        output: row.querySelector("[data-test-output]").value
      })),
      published: $("#problem-published-input").checked
    };
    try {
      const endpoint = editingProblemId
        ? `/api/teacher/problems/${encodeURIComponent(editingProblemId)}`
        : "/api/teacher/problems";
      await apiRequest(endpoint, { method: editingProblemId ? "PUT" : "POST", body: JSON.stringify(problem) });
      const wasEditing = Boolean(editingProblemId);
      clearTeacherProblemForm();
      $("#teacher-problem-note").textContent = wasEditing ? "문제를 수정했어요." : "문제를 추가했어요.";
      await loadTeacherDashboard();
      await refreshStudentProblems();
    } catch (error) {
      $("#teacher-problem-note").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  function setTeacherTab(tab) {
    const showProblems = tab === "problems";
    $("#teacher-students-panel").hidden = showProblems;
    $("#teacher-problems-panel").hidden = !showProblems;
    $("#teacher-tab-students").classList.toggle("active", !showProblems);
    $("#teacher-tab-problems").classList.toggle("active", showProblems);
  }

  function updateProgress() {
    const completed = saved.solvedIds || [];
    const count = problems.filter((problem) => completed.includes(problem.id)).length;
    const firstUnsolvedIndex = problems.findIndex((problem) => !completed.includes(problem.id));
    const firstUnsolved = firstUnsolvedIndex < 0 ? problems.length : firstUnsolvedIndex;
    $("#solved-count").textContent = count;
    $("#progress-label").textContent = `${Math.round(count / Math.max(1, problems.length) * 100)}%`;
    $("#progress-bar").style.width = `${count / Math.max(1, problems.length) * 100}%`;
    list.querySelectorAll(".problem-link").forEach((button, index) => {
      const problem = problems[index];
      button.classList.toggle("solved", completed.includes(problem.id));
      button.classList.toggle("active", currentIndex === index);
      button.classList.toggle("locked", index > firstUnsolved);
      button.disabled = index > firstUnsolved;
      button.setAttribute("aria-label", `문제 ${index + 1}: ${problem.title}${index > firstUnsolved ? " (잠김)" : ""}`);
      const number = button.querySelector(".problem-index");
      number.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>`;
    });
  }

  function renderList() {
    list.innerHTML = problems.map((problem, index) => `<button class="problem-link" type="button" data-index="${index}" aria-label="문제 ${index + 1}: ${escapeHtml(problem.title)}"><span class="problem-index"><span>${String(index + 1).padStart(2, "0")}</span></span><span class="problem-link-title">${escapeHtml(problem.title)}</span><span class="problem-link-diff">${escapeHtml(problem.difficulty)}</span></button>`).join("");
    $("#problem-count").textContent = `${problems.length} 문제`;
    $("#total-problems").textContent = problems.length;
    updateProgress();
  }

  function renderProblem() {
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    const problem = problems[currentIndex];
    if (!problem) {
      $("#problem-title").textContent = "현재 공개된 문제가 없습니다";
      $("#problem-description").textContent = "선생님이 문제를 공개하면 여기에서 확인할 수 있어요.";
      $("#problem-tags").innerHTML = "";
      $("#problem-input").textContent = "";
      $("#problem-output").textContent = "";
      $("#sample-input").textContent = "";
      $("#sample-output").textContent = "";
      editor.value = "";
      editor.disabled = true;
      submitButton.disabled = true;
      sampleButton.disabled = true;
      return;
    }
    editor.disabled = false;
    submitButton.disabled = false;
    sampleButton.disabled = false;
    $("#breadcrumb-title").textContent = `문제 ${String(currentIndex + 1).padStart(2, "0")}`;
    $("#problem-number").textContent = String(currentIndex + 1).padStart(2, "0");
    $("#difficulty").textContent = problem.difficulty;
    $("#problem-title").textContent = problem.title;
    $("#problem-tags").innerHTML = problem.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    $("#problem-description").textContent = problem.description;
    $("#problem-input").textContent = problem.input;
    $("#problem-output").textContent = problem.output;
    $("#sample-input").textContent = problem.sampleInput;
    $("#sample-output").textContent = problem.sampleOutput;
    $("#problem-hint").textContent = problem.hint;
    $("#problem-position").textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(problems.length).padStart(2, "0")}`;
    $("#prev-button").disabled = currentIndex === 0;
    const next = $("#next-button");
    next.disabled = currentIndex === problems.length - 1 || !(saved.solvedIds || []).includes(problem.id);
    next.title = next.disabled && currentIndex < problems.length - 1 ? "현재 문제를 먼저 맞혀 보세요" : "다음 문제";
    saved.currentProblemId = problem.id;
    editor.value = (saved.codes || {})[problem.id] ?? problem.starter;
    resultPanel.hidden = true;
    resultPanel.innerHTML = "";
    lastTutorRun = null;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
    updateLineNumbers();
    updateProgress();
  }

  function selectProblem(index) {
    if (judgeBusy || index < 0 || index >= problems.length || index === currentIndex) return;
    currentIndex = index;
    persist();
    renderProblem();
  }

  function updateLineNumbers() {
    const count = editor.value.split("\n").length;
    $("#line-numbers").textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    $("#line-count").textContent = `${count}줄`;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function pythonWorker() {
    const source = `
      import sys, io, json
      async def run(payload):
          results = []
          source = payload["code"]
          for test_input in payload["inputs"]:
              output = io.StringIO()
              previous_stdin, previous_stdout = sys.stdin, sys.stdout
              sys.stdin, sys.stdout = io.StringIO(test_input), output
              try:
                  exec(compile(source, "solution.py", "exec"), {"__name__": "__main__"})
                  results.append({"output": output.getvalue(), "error": None})
              except BaseException as exc:
                  results.append({"output": output.getvalue(), "error": str(exc) or type(exc).__name__})
              finally:
                  sys.stdin, sys.stdout = previous_stdin, previous_stdout
          return json.dumps(results)
    `.replace(/^      /gm, "");
    const workerSource = `
      importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
      let runtime;
      onmessage = async (event) => {
        try {
          runtime ||= await loadPyodide();
          const payload = event.data;
          runtime.globals.set("payload_json", JSON.stringify(payload));
          const response = await runtime.runPythonAsync(${JSON.stringify(source)} + "\\nimport json\\npayload = json.loads(payload_json)\\nawait run(payload)");
          postMessage({ type: "done", results: JSON.parse(response) });
        } catch (error) {
          postMessage({ type: "error", message: error.message || String(error) });
        }
      };
    `;
    return new Worker(URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })));
  }

  function normalizeOutput(value) {
    return value.replace(/\r\n/g, "\n").trim();
  }

  function renderSampleResults(results, expected) {
    const allPassed = results.length > 0 && results.every((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index]));
    const codeError = results.find((result) => result.error);
    lastTutorRun = codeError ? { kind: "error", message: codeError.error } : null;
    updateTutorButtons();
    const rows = results.map((result, index) => {
      const passed = !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index]);
      const detail = !passed ? result.error ? `오류: ${result.error}` : `내 출력: ${result.output || "(출력 없음)"}\n기대 출력: ${expected[index]}` : "";
      return `<div class="case-row ${passed ? "pass" : "fail"}"><span class="case-name"><span>${passed ? "✓" : "×"}</span>예제</span><span class="case-state">${passed ? "통과" : "실패"}</span>${detail ? `<div class="case-detail">${escapeHtml(detail)}</div>` : ""}</div>`;
    }).join("");
    resultPanel.innerHTML = `<div class="result-summary ${allPassed ? "all-pass" : "has-error"}"><strong>${allPassed ? "예제 통과" : "예제를 다시 확인해 보세요"}</strong><span>${results.filter((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index])).length} / ${results.length} 통과</span></div><div class="case-list">${rows}</div>`;
    resultPanel.hidden = false;
  }

  function renderJudgeResult(result) {
    const allPassed = result.accepted;
    lastTutorRun = result.kind === "error"
      ? { kind: "error", message: result.error || "실행 중 오류가 발생했어요." }
      : !allPassed ? { kind: "wrong", passed: result.passed, total: result.total } : null;
    updateTutorButtons();
    const title = allPassed ? "모든 테스트 통과" : result.kind === "error" ? "코드 실행 중 오류" : "다시 확인해 보세요";
    const rows = result.cases.map((test, index) => `<div class="case-row ${test.passed ? "pass" : "fail"}"><span class="case-name"><span>${test.passed ? "✓" : "×"}</span>테스트 ${String(index + 1).padStart(2, "0")}</span><span class="case-state">${escapeHtml(test.label)}</span></div>`).join("");
    resultPanel.innerHTML = `<div class="result-summary ${allPassed ? "all-pass" : "has-error"}"><strong>${title}</strong><span>${result.passed} / ${result.total} 통과</span></div><div class="case-list">${rows}</div>`;
    resultPanel.hidden = false;
    if (allPassed) {
      const problemId = problems[currentIndex].id;
      saved.solvedIds ||= [];
      if (!saved.solvedIds.includes(problemId)) saved.solvedIds.push(problemId);
      persist();
      if (currentIndex < problems.length - 1) showToast("정답이에요! 다음 문제가 열렸어요.");
      else showToast("축하해요! 모든 공개 문제를 풀었어요.");
    }
  }

  function updateTutorButtons() {
    $("#tutor-hint").disabled = tutorBusy || (tutorHintLevels[problems[currentIndex]?.id] || 0) >= 3;
    $("#tutor-error").disabled = tutorBusy || lastTutorRun?.kind !== "error";
    $("#tutor-wrong").disabled = tutorBusy || lastTutorRun?.kind !== "wrong";
  }

  function showTutorResponse(title, message) {
    $("#tutor-response-title").textContent = title;
    $("#tutor-response-body").textContent = message;
    $("#tutor-response").hidden = false;
  }

  async function requestTutor(kind) {
    if (tutorBusy) return;
    const requestIndex = currentIndex;
    const problemId = problems[requestIndex].id;
    const requestCode = editor.value;
    const hintLevel = Math.min((tutorHintLevels[problemId] || 0) + 1, 3);
    const controller = new AbortController();
    tutorController = controller;
    tutorBusy = true;
    updateTutorButtons();
    showTutorResponse("튜터가 생각하고 있어요", "문제와 작성한 코드를 살펴보고 있습니다.");

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind,
          problemId,
          code: requestCode,
          hintLevel: kind === "hint" ? hintLevel : undefined,
          error: kind === "error" ? lastTutorRun?.message : undefined,
          result: kind === "wrong" ? { passed: lastTutorRun?.passed, total: lastTutorRun?.total } : undefined
        })
      });
      const reply = await response.json();
      if (!response.ok) throw new Error(reply.message || "튜터에 연결하지 못했어요.");
      if (controller.signal.aborted) return;
      if (currentIndex !== requestIndex || editor.value !== requestCode) {
        showTutorResponse("코드가 바뀌었어요", "현재 작성한 코드 기준으로 다시 도움을 요청해 주세요.");
        return;
      }
      if (kind === "hint") tutorHintLevels[problemId] = hintLevel;
      showTutorResponse(reply.title, `${reply.message}\n\n생각해 볼 질문: ${reply.question}`);
    } catch (error) {
      if (!controller.signal.aborted) {
        showTutorResponse("튜터에 연결하지 못했어요", error.message || "잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (tutorController === controller) {
        tutorController = null;
        tutorBusy = false;
        updateTutorButtons();
      }
    }
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  async function runCode(isSample) {
    if (!editor.value.trim()) {
      showToast("코드를 먼저 입력해 주세요.");
      editor.focus();
      return;
    }
    if (!isSample && currentAccount?.role !== "student") {
      if (currentAccount?.role === "teacher") showToast("학생 계정으로 로그인해야 제출할 수 있어요.");
      else {
        showToast("정답 제출은 학생 로그인 후 사용할 수 있어요.");
        setAccountRole("student");
        $("#account-dialog").showModal();
      }
      return;
    }
    if (activeWorker) activeWorker.terminate();
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    lastTutorRun = null;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
    submitButton.disabled = true;
    sampleButton.disabled = true;
    $(".submit-label").textContent = isSample ? "실행 중..." : "숨김 테스트로 채점 중...";
    resultPanel.hidden = false;
    resultPanel.innerHTML = `<div class="result-summary"><strong>${isSample ? "예제를 실행하고 있어요" : "비공개 테스트케이스로 채점하고 있어요"}</strong><span>잠시만 기다려 주세요</span></div>`;
    const problem = problems[currentIndex];
    if (!isSample) {
      judgeBusy = true;
      try {
        const result = await apiRequest("/api/judge", {
          method: "POST",
          body: JSON.stringify({ problemId: problem.id, code: editor.value })
        });
        renderJudgeResult(result);
      } catch (error) {
        lastTutorRun = null;
        updateTutorButtons();
        resultPanel.innerHTML = `<div class="result-summary has-error"><strong>채점할 수 없어요</strong></div><div class="case-row fail"><span class="case-name">${escapeHtml(error.message)}</span></div>`;
      } finally {
        judgeBusy = false;
        resetRunButtons();
      }
      return;
    }

    const selectedTests = [[problem.sampleInput, problem.sampleOutput]];
    try {
      const worker = pythonWorker();
      activeWorker = worker;
      const timeout = setTimeout(() => {
        worker.terminate();
        activeWorker = null;
        resetRunButtons();
        lastTutorRun = { kind: "error", message: "실행 시간이 초과됐어요." };
        updateTutorButtons();
        resultPanel.innerHTML = `<div class="result-summary has-error"><strong>실행 시간이 초과됐어요</strong><span>10초 제한</span></div><div class="case-row fail"><span class="case-name">무한 반복문이 있는지 확인해 주세요.</span></div>`;
      }, 10000);
      worker.onmessage = (event) => {
        clearTimeout(timeout);
        activeWorker = null;
        resetRunButtons();
        if (event.data.type === "error") {
          lastTutorRun = null;
          updateTutorButtons();
          const message = event.data.message.includes("fetch") || event.data.message.includes("network") ? "실행 환경을 불러오지 못했어요. 인터넷 연결을 확인해 주세요." : event.data.message;
          resultPanel.innerHTML = `<div class="result-summary has-error"><strong>코드를 실행하지 못했어요</strong></div><div class="case-row fail"><div class="case-detail">${escapeHtml(message)}</div></div>`;
          return;
        }
        renderSampleResults(event.data.results, selectedTests.map((test) => test[1]));
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        activeWorker = null;
        resetRunButtons();
        lastTutorRun = null;
        updateTutorButtons();
        resultPanel.innerHTML = `<div class="result-summary has-error"><strong>파이썬 실행 환경에 연결할 수 없어요</strong></div><div class="case-row fail"><div class="case-detail">인터넷 연결을 확인한 뒤 다시 실행해 주세요.</div></div>`;
      };
      worker.postMessage({ code: editor.value, inputs: selectedTests.map((test) => test[0]) });
    } catch (error) {
      activeWorker = null;
      resetRunButtons();
      resultPanel.innerHTML = `<div class="result-summary has-error"><strong>실행 환경을 시작하지 못했어요</strong></div><div class="case-row fail"><div class="case-detail">${escapeHtml(error.message)}</div></div>`;
    }
  }

  function resetRunButtons() {
    submitButton.disabled = false;
    sampleButton.disabled = false;
    $(".submit-label").textContent = "정답 제출";
  }

  editor.addEventListener("input", () => {
    updateLineNumbers();
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    lastTutorRun = null;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
    saved.codes ||= {};
    saved.codes[problems[currentIndex].id] = editor.value;
    persist();
    $("#unsaved-dot").hidden = false;
  });
  editor.addEventListener("scroll", () => { $("#line-numbers").scrollTop = editor.scrollTop; });
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText("    ", start, end, "end");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  $("#prev-button").addEventListener("click", () => selectProblem(currentIndex - 1));
  $("#next-button").addEventListener("click", () => selectProblem(currentIndex + 1));
  $("#reset-button").addEventListener("click", () => {
    editor.value = problems[currentIndex].starter;
    saved.codes ||= {};
    saved.codes[problems[currentIndex].id] = editor.value;
    persist();
    updateLineNumbers();
    $("#unsaved-dot").hidden = true;
    showToast("코드를 처음 상태로 되돌렸어요.");
  });
  $("#tutor-hint").addEventListener("click", () => requestTutor("hint"));
  $("#tutor-error").addEventListener("click", () => requestTutor("error"));
  $("#tutor-wrong").addEventListener("click", () => requestTutor("wrong"));
  $("#tutor-close").addEventListener("click", () => {
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
  });
  submitButton.addEventListener("click", () => runCode(false));
  sampleButton.addEventListener("click", () => runCode(true));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runCode(false);
    }
  });
  const dialog = $("#help-dialog");
  $("#help-button").addEventListener("click", () => dialog.showModal());
  $("#dialog-close").addEventListener("click", () => dialog.close());
  const accountDialog = $("#account-dialog");
  $("#account-button").addEventListener("click", async () => {
    if (currentAccount?.role === "teacher") {
      await loadTeacherDashboard();
      $("#teacher-dialog").showModal();
      return;
    }
    if (currentAccount) {
      await logoutAccount();
      return;
    }
    setAccountRole("student");
    accountDialog.showModal();
  });
  $("#account-dialog-close").addEventListener("click", () => accountDialog.close());
  accountDialog.addEventListener("close", () => {
    $("#account-pin").value = "";
    setAccountRole("student");
  });
  $("#account-form").addEventListener("submit", submitAccountForm);
  $("#student-role-button").addEventListener("click", () => setAccountRole("student"));
  $("#teacher-role-button").addEventListener("click", () => setAccountRole("teacher"));
  $("#teacher-dialog-close").addEventListener("click", () => $("#teacher-dialog").close());
  $("#teacher-logout").addEventListener("click", logoutAccount);
  $("#teacher-add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await apiRequest("/api/teacher/students", {
        method: "POST",
        body: JSON.stringify({
          username: $("#new-student-username").value.trim().toLowerCase(),
          pin: $("#new-student-pin").value.trim()
        })
      });
      event.currentTarget.reset();
      $("#teacher-note").textContent = `학생 ${result.username} 계정을 만들었어요.`;
      await loadTeacherDashboard();
    } catch (error) {
      $("#teacher-note").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $("#teacher-student-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-reset-student]");
    if (!button) return;
    $("#teacher-reset-form").dataset.studentId = button.dataset.resetStudent;
    $("#reset-student-name").textContent = button.dataset.resetUsername;
    $("#reset-student-pin").value = "";
    $("#teacher-reset-form").hidden = false;
    $("#reset-student-pin").focus();
  });
  $("#teacher-reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const studentId = form.dataset.studentId;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await apiRequest(`/api/teacher/students/${encodeURIComponent(studentId)}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pin: $("#reset-student-pin").value.trim() })
      });
      form.hidden = true;
      form.reset();
      $("#teacher-note").textContent = `${result.username} 학생의 PIN을 초기화했어요.`;
      await loadTeacherDashboard();
    } catch (error) {
      $("#teacher-note").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $("#teacher-pin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await apiRequest("/api/teacher/account/pin", {
        method: "PUT",
        body: JSON.stringify({
          currentPin: $("#teacher-current-pin").value.trim(),
          newPin: $("#teacher-new-pin").value.trim()
        })
      });
      form.reset();
      $("#teacher-note").textContent = "선생님 PIN을 변경했어요.";
    } catch (error) {
      $("#teacher-note").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $("#teacher-tab-students").addEventListener("click", () => setTeacherTab("students"));
  $("#teacher-tab-problems").addEventListener("click", () => setTeacherTab("problems"));
  $("#teacher-problem-form").addEventListener("submit", saveTeacherProblem);
  $("#teacher-problem-cancel").addEventListener("click", clearTeacherProblemForm);
  $("#add-problem-test").addEventListener("click", () => addProblemTestRow());
  $("#teacher-problem-list").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-problem]");
    const toggleButton = event.target.closest("[data-toggle-problem]");
    const deleteButton = event.target.closest("[data-delete-problem]");
    try {
      if (editButton) {
        editTeacherProblem(editButton.dataset.editProblem);
        return;
      }
      if (toggleButton) {
        const problem = teacherProblems.find((entry) => entry.id === toggleButton.dataset.toggleProblem);
        if (!problem) return;
        await apiRequest(`/api/teacher/problems/${encodeURIComponent(problem.id)}/visibility`, {
          method: "PUT",
          body: JSON.stringify({ published: !problem.published })
        });
        $("#teacher-problem-note").textContent = problem.published ? "문제를 비공개로 바꿨어요." : "문제를 공개했어요.";
      } else if (deleteButton) {
        const problem = teacherProblems.find((entry) => entry.id === deleteButton.dataset.deleteProblem);
        if (!problem || !window.confirm(`'${problem.title}' 문제를 삭제할까요?`)) return;
        await apiRequest(`/api/teacher/problems/${encodeURIComponent(problem.id)}`, { method: "DELETE" });
        if (editingProblemId === problem.id) clearTeacherProblemForm();
        $("#teacher-problem-note").textContent = "문제를 삭제했어요.";
      } else {
        return;
      }
      await loadTeacherDashboard();
      await refreshStudentProblems();
    } catch (error) {
      $("#teacher-problem-note").textContent = error.message;
    }
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest(".problem-link");
    if (button) selectProblem(Number(button.dataset.index));
  });
  clearTeacherProblemForm();
  setTeacherTab("students");
  try {
    await loadProblemList();
  } catch {
    $("#problem-title").textContent = "문제를 불러오지 못했어요";
    $("#problem-description").textContent = "서버 연결을 확인한 뒤 새로고침해 주세요.";
  }
  updateAccountButton();
  await startAuth();
})();
