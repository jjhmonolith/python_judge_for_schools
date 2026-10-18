import { PROBLEMS } from "./problems.js";

(() => {
  const problems = PROBLEMS;
  const $ = (selector) => document.querySelector(selector);
  const list = $("#problem-list");
  const editor = $("#code-editor");
  const resultPanel = $("#result-panel");
  const submitButton = $("#submit-button");
  const sampleButton = $("#sample-button");
  const storageKey = "code-practice-judge-v1";
  let saved = loadProgress();
  let currentIndex = Math.min(Math.max(saved.current || 0, 0), problems.length - 1);
  let toastTimer;
  let activeWorker;
  let currentAccount = null;
  let cloudSaveTimer;
  let isHydrating = false;
  let accountRole = "student";
  let cloudErrorShown = false;
  let lastTutorRun = null;
  const tutorHintLevels = {};
  let tutorBusy = false;
  let tutorController = null;

  function loadProgress(key = storageKey) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }

  function progressStorageKey() {
    return currentAccount?.role === "student" ? `${storageKey}:${currentAccount.id}` : storageKey;
  }

  function persist() {
    saved.current = currentIndex;
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
          current: currentIndex,
          solved: saved.solved || [],
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
    const localProgress = loadProgress(progressStorageKey());
    saved = {
      current: data.current ?? localProgress.current ?? 0,
      solved: [...new Set([...(localProgress.solved || []), ...(data.solved || [])])],
      codes: { ...(localProgress.codes || {}), ...(data.codes || {}) }
    };
    currentIndex = Math.min(Math.max(saved.current || 0, 0), problems.length - 1);
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
        saved = { current: 0, solved: [], codes: {} };
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
    if (currentAccount?.role === "student") {
      clearTimeout(cloudSaveTimer);
      await saveCloudProgress();
    }
    try { await apiRequest("/api/auth/logout", { method: "POST", body: "{}" }); }
    catch { /* Local state is cleared even if the server is unavailable. */ }
    currentAccount = null;
    saved = loadProgress();
    currentIndex = Math.min(Math.max(saved.current || 0, 0), problems.length - 1);
    if ($("#teacher-dialog").open) $("#teacher-dialog").close();
    renderProblem();
    updateAccountButton();
    showToast("로그아웃했어요.");
  }

  async function loadTeacherDashboard() {
    try {
      const { students } = await apiRequest("/api/teacher/students");
      $("#teacher-count").textContent = `${students.length}명`;
      $("#teacher-student-list").innerHTML = students.length
        ? students.map((student) => {
          const percent = Math.round(student.solvedCount / problems.length * 100);
          const activity = student.updatedAt ? new Date(student.updatedAt).toLocaleString("ko-KR") : "아직 풀이 기록이 없어요";
          return `<article class="teacher-student-card"><div class="teacher-student-top"><div><strong>${escapeHtml(student.username)}</strong><span>${student.solvedCount} / ${problems.length} 문제 완료</span></div><button type="button" data-reset-student="${escapeHtml(student.id)}" data-reset-username="${escapeHtml(student.username)}">PIN 초기화</button></div><div class="teacher-progress"><span style="width:${percent}%"></span></div><small>최근 학습: ${escapeHtml(activity)}</small></article>`;
        }).join("")
        : '<p class="teacher-empty">학생 계정이 없어요. 아래에서 추가해 주세요.</p>';
    } catch (error) {
      $("#teacher-student-list").innerHTML = `<p class="teacher-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  function updateProgress() {
    const completed = saved.solved || [];
    const count = completed.length;
    let firstUnsolved = 0;
    while (completed.includes(firstUnsolved)) firstUnsolved += 1;
    $("#solved-count").textContent = count;
    $("#progress-label").textContent = `${Math.round(count / problems.length * 100)}%`;
    $("#progress-bar").style.width = `${count / problems.length * 100}%`;
    list.querySelectorAll(".problem-link").forEach((button, index) => {
      button.classList.toggle("solved", completed.includes(index));
      button.classList.toggle("active", currentIndex === index);
      button.classList.toggle("locked", index > firstUnsolved);
      button.disabled = index > firstUnsolved;
      button.setAttribute("aria-label", `문제 ${index + 1}: ${problems[index].title}${index > firstUnsolved ? " (잠김)" : ""}`);
      const number = button.querySelector(".problem-index");
      number.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>`;
    });
  }

  function renderList() {
    list.innerHTML = problems.map((problem, index) => `<button class="problem-link" type="button" data-index="${index}" aria-label="문제 ${index + 1}: ${problem.title}"><span class="problem-index"><span>${String(index + 1).padStart(2, "0")}</span></span><span class="problem-link-title">${problem.title}</span><span class="problem-link-diff">${problem.difficulty}</span></button>`).join("");
    list.addEventListener("click", (event) => {
      const button = event.target.closest(".problem-link");
      if (button) selectProblem(Number(button.dataset.index));
    });
  }

  function renderProblem() {
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    const problem = problems[currentIndex];
    $("#breadcrumb-title").textContent = `문제 ${String(currentIndex + 1).padStart(2, "0")}`;
    $("#problem-number").textContent = String(currentIndex + 1).padStart(2, "0");
    $("#difficulty").textContent = problem.difficulty;
    $("#problem-title").textContent = problem.title;
    $("#problem-tags").innerHTML = problem.tags.map((tag) => `<span>${tag}</span>`).join("");
    $("#problem-description").textContent = problem.description;
    $("#problem-input").textContent = problem.input;
    $("#problem-output").textContent = problem.output;
    $("#sample-input").textContent = problem.sampleInput;
    $("#sample-output").textContent = problem.sampleOutput;
    $("#problem-hint").textContent = problem.hint;
    $("#problem-position").textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(problems.length).padStart(2, "0")}`;
    $("#prev-button").disabled = currentIndex === 0;
    const next = $("#next-button");
    next.disabled = currentIndex === problems.length - 1 || !(saved.solved || []).includes(currentIndex);
    next.title = next.disabled && currentIndex < problems.length - 1 ? "현재 문제를 먼저 맞혀 보세요" : "다음 문제";
    editor.value = (saved.codes || {})[currentIndex] ?? problem.starter;
    resultPanel.hidden = true;
    resultPanel.innerHTML = "";
    lastTutorRun = null;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
    updateLineNumbers();
    updateProgress();
  }

  function selectProblem(index) {
    if (index < 0 || index >= problems.length || index === currentIndex) return;
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

  function renderResults(results, expected, isSample) {
    const allPassed = results.length > 0 && results.every((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index]));
    const passedCount = results.filter((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index])).length;
    const codeError = results.find((result) => result.error);
    lastTutorRun = codeError
      ? { kind: "error", message: codeError.error }
      : !allPassed && !isSample
        ? { kind: "wrong", passed: passedCount, total: results.length }
        : null;
    updateTutorButtons();
    const title = allPassed ? (isSample ? "예제 통과" : "모든 테스트 통과") : results.some((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index])) ? "일부 테스트 통과" : "다시 확인해 보세요";
    const rows = results.map((result, index) => {
      const passed = !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index]);
      let detail = "";
      if (!passed) {
        if (result.error) detail = `오류: ${result.error}`;
        else detail = `내 출력: ${result.output || "(출력 없음)"}\n기대 출력: ${expected[index]}`;
      }
      return `<div class="case-row ${passed ? "pass" : "fail"}"><span class="case-name"><span>${passed ? "✓" : "×"}</span>${isSample ? "예제" : `테스트 ${String(index + 1).padStart(2, "0")}`}</span><span class="case-state">${passed ? "통과" : "실패"}</span>${detail ? `<div class="case-detail">${escapeHtml(detail)}</div>` : ""}</div>`;
    }).join("");
    resultPanel.innerHTML = `<div class="result-summary ${allPassed ? "all-pass" : "has-error"}"><strong>${title}</strong><span>${results.filter((result, index) => !result.error && normalizeOutput(result.output) === normalizeOutput(expected[index])).length} / ${results.length} 통과</span></div><div class="case-list">${rows}</div>`;
    resultPanel.hidden = false;
    if (allPassed && !isSample) {
      const solved = saved.solved || [];
      if (!solved.includes(currentIndex)) saved.solved = [...solved, currentIndex].sort((a, b) => a - b);
      persist();
      $("#next-button").disabled = currentIndex >= problems.length - 1;
      if (currentIndex < problems.length - 1) showToast("정답이에요! 다음 문제가 열렸어요.");
      else showToast("축하해요! 10문제를 모두 풀었어요.");
    }
  }

  function updateTutorButtons() {
    $("#tutor-hint").disabled = tutorBusy || (tutorHintLevels[currentIndex] || 0) >= 3;
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
    const requestCode = editor.value;
    const hintLevel = Math.min((tutorHintLevels[requestIndex] || 0) + 1, 3);
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
          problemIndex: requestIndex,
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
      if (kind === "hint") tutorHintLevels[requestIndex] = hintLevel;
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
    if (activeWorker) activeWorker.terminate();
    tutorController?.abort();
    tutorController = null;
    tutorBusy = false;
    lastTutorRun = null;
    $("#tutor-response").hidden = true;
    updateTutorButtons();
    submitButton.disabled = true;
    sampleButton.disabled = true;
    $(".submit-label").textContent = "실행 중...";
    resultPanel.hidden = false;
    resultPanel.innerHTML = `<div class="result-summary"><strong>파이썬 실행 환경을 준비하고 있어요</strong><span>잠시만 기다려 주세요</span></div>`;
    const problem = problems[currentIndex];
    const selectedTests = isSample ? [[problem.sampleInput, problem.sampleOutput]] : problem.tests;
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
        renderResults(event.data.results, selectedTests.map((test) => test[1]), isSample);
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
    saved.codes[currentIndex] = editor.value;
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
    saved.codes[currentIndex] = editor.value;
    persist();
    updateLineNumbers();
    $("#unsaved-dot").hidden = true;
    showToast("코드를 처음 상태로 되돌렸어요.");
  });
  $("#answer-button").addEventListener("click", () => {
    editor.value = problems[currentIndex].answer;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    resultPanel.hidden = true;
    resultPanel.innerHTML = "";
    editor.focus();
    showToast("모범 답안을 편집기에 입력했어요.");
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

  renderList();
  renderProblem();
  updateAccountButton();
  startAuth();
})();
