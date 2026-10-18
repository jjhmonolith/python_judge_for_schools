import { createClient } from "@supabase/supabase-js";
import { PROBLEMS } from "./problems.js";

(() => {
  const problems = PROBLEMS;
  const supabaseUrl = __SUPABASE_URL__.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const supabasePublishableKey = __SUPABASE_PUBLISHABLE_KEY__;
  const supabase = supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;
  const $ = (selector) => document.querySelector(selector);
  const list = $("#problem-list");
  const editor = $("#code-editor");
  const resultPanel = $("#result-panel");
  const submitButton = $("#submit-button");
  const sampleButton = $("#sample-button");
  const storageKey = "code-practice-judge-v1";
  const sessionStorageKey = "code-practice-session-v1";
  let saved = loadProgress();
  let currentIndex = Math.min(Math.max(saved.current || 0, 0), problems.length - 1);
  let toastTimer;
  let activeWorker;
  let currentStudent = null;
  let cloudSaveTimer;
  let isHydrating = false;
  let accountMode = "login";
  let cloudErrorShown = false;
  let lastTutorRun = null;
  const tutorHintLevels = {};

  function loadProgress(key = storageKey) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }

  function progressStorageKey() {
    return currentStudent ? `${storageKey}:${currentStudent.student_id}` : storageKey;
  }

  function persist() {
    saved.current = currentIndex;
    localStorage.setItem(progressStorageKey(), JSON.stringify(saved));
    updateProgress();
    if (currentStudent && !isHydrating) scheduleCloudSave();
  }

  function scheduleCloudSave() {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(saveCloudProgress, 700);
  }

  async function saveCloudProgress() {
    if (!supabase || !currentStudent) return;
    try {
      const { data, error } = await supabase.rpc("student_save_progress", {
        p_session_token: currentStudent.session_token,
        p_current_problem: currentIndex,
        p_solved: saved.solved || [],
        p_codes: saved.codes || {}
      });
      if (error || data?.error) throw error || new Error(data.error);
      cloudErrorShown = false;
    } catch {
      if (!cloudErrorShown) showToast("온라인 저장에 실패했어요. 다시 로그인해 주세요.");
      cloudErrorShown = true;
    }
  }

  async function activateStudent(profile) {
    currentStudent = {
      student_id: profile.student_id,
      username: profile.username,
      session_token: profile.session_token
    };
    localStorage.setItem(sessionStorageKey, JSON.stringify(currentStudent));
    updateAccountButton();

    let data;
    let error;
    try {
      ({ data, error } = await supabase.rpc("student_get_progress", {
        p_session_token: currentStudent.session_token
      }));
    } catch {
      data = null;
      error = new Error("network");
    }
    if (error || data?.error) {
      const message = error?.message === "network"
        ? "인터넷 연결을 확인하고 다시 로그인해 주세요."
        : data?.error === "session_expired"
          ? "로그인 시간이 끝났어요. 다시 로그인해 주세요."
          : "계정 저장 설정을 확인해 주세요. 새 supabase-schema.sql을 실행해 주세요.";
      currentStudent = null;
      localStorage.removeItem(sessionStorageKey);
      updateAccountButton();
      setAccountNote(message);
      return false;
    }

    isHydrating = true;
    const localProgress = loadProgress(progressStorageKey());
    saved = {
      current: data.current_problem ?? localProgress.current ?? 0,
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
    button.textContent = currentStudent ? "로그아웃" : "로그인";
    button.setAttribute("aria-label", currentStudent ? `${currentStudent.username} 로그아웃` : "아이디로 로그인");
    $("#save-location").innerHTML = currentStudent
      ? '기록은 계정에 자동 저장됩니다 <span class="save-check">✓</span>'
      : '기록은 이 기기에 자동 저장됩니다 <span class="save-check">✓</span>';
  }

  async function startAuth() {
    if (!supabase) {
      setAccountNote("Supabase 연결 정보를 찾을 수 없어요. 관리자에게 알려주세요.");
      return;
    }
    const session = loadStudentSession();
    if (!session?.session_token) return;
    try {
      await activateStudent(session);
    } catch {
      showToast("저장된 학습 계정에 연결하지 못했어요.");
    }
  }

  function loadStudentSession() {
    try { return JSON.parse(localStorage.getItem(sessionStorageKey)); }
    catch { return null; }
  }

  function setAccountNote(message) {
    $("#account-note").textContent = message;
  }

  function setAccountMode(mode) {
    accountMode = mode;
    const isSignup = mode === "signup";
    const isReset = mode === "reset";
    $("#account-title").textContent = isSignup ? "계정 만들기" : isReset ? "PIN 재설정" : "로그인";
    $("#account-description").textContent = isSignup
      ? "사용할 아이디와 6자리 PIN을 정해 주세요."
      : isReset ? "아이디, 복구 코드, 새 PIN을 입력해 주세요." : "아이디와 6자리 PIN으로 학습 기록을 이어가세요.";
    $("#pin-label").textContent = isReset ? "새 6자리 PIN" : "6자리 PIN";
    $("#account-submit").textContent = isSignup ? "계정 만들기" : isReset ? "PIN 재설정" : "로그인";
    $("#account-switch").textContent = isReset ? "로그인으로 돌아가기" : isSignup ? "이미 계정이 있나요? 로그인" : "처음 이용하나요? 계정 만들기";
    $("#account-switch").hidden = false;
    $("#forgot-pin-button").hidden = mode !== "login";
    $("#recovery-field").hidden = !isReset;
    $("#recovery-input").required = isReset;
    $("#account-form").hidden = false;
    $("#recovery-panel").hidden = true;
    setAccountNote("아이디는 영문 소문자, 숫자, 밑줄 3~20자이며 PIN은 6자리 숫자예요.");
  }

  function showRecoveryCode(code) {
    $("#account-form").hidden = true;
    $("#account-switch").hidden = true;
    $("#forgot-pin-button").hidden = true;
    $("#recovery-panel").hidden = false;
    $("#account-title").textContent = "복구 코드를 적어 두세요";
    $("#account-description").textContent = "PIN을 잊었을 때 필요한 코드입니다. 이 화면을 닫으면 다시 볼 수 없어요.";
    $("#recovery-code").textContent = code;
  }

  function accountErrorMessage(code) {
    if (code === "username_taken") return "이미 사용 중인 아이디예요. 다른 아이디를 골라 주세요.";
    if (code === "invalid_credentials") return "아이디나 PIN을 확인해 주세요. 여러 번 틀리면 잠시 기다려야 해요.";
    if (code === "invalid_recovery") return "아이디와 복구 코드를 확인해 주세요.";
    if (code === "invalid_input") return "아이디 형식과 6자리 숫자 PIN을 확인해 주세요.";
    return "Supabase 설정을 확인해 주세요. 관리자에게 schema 파일 실행을 요청하세요.";
  }

  async function submitAccountForm(event) {
    event.preventDefault();
    if (!supabase) {
      setAccountNote("Supabase 연결 정보를 찾을 수 없어요. 관리자에게 알려주세요.");
      return;
    }

    const username = $("#account-username").value.trim().toLowerCase();
    const pin = $("#account-pin").value.trim();
    const payload = accountMode === "signup"
      ? { functionName: "student_register", params: { p_username: username, p_pin: pin } }
      : accountMode === "reset"
        ? { functionName: "student_reset_pin", params: { p_username: username, p_recovery_code: $("#recovery-input").value.trim(), p_new_pin: pin } }
        : { functionName: "student_login", params: { p_username: username, p_pin: pin } };

    $("#account-submit").disabled = true;
    setAccountNote("확인하고 있어요...");
    try {
      const { data, error } = await supabase.rpc(payload.functionName, payload.params);
      if (error) {
        setAccountNote("Supabase 설정이 아직 끝나지 않았어요. 새 supabase-schema.sql을 실행했는지 확인해 주세요.");
      } else if (data?.error) {
        setAccountNote(accountErrorMessage(data.error));
      } else if (await activateStudent(data)) {
        $("#account-pin").value = "";
        $("#recovery-input").value = "";
        if (data.recovery_code) showRecoveryCode(data.recovery_code);
        else {
          $("#account-dialog").close();
          showToast(accountMode === "reset" ? "PIN을 새로 설정했어요." : accountMode === "signup" ? "계정이 만들어졌어요." : "로그인했어요.");
        }
      }
    } catch {
      setAccountNote("연결에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      $("#account-submit").disabled = false;
    }
  }

  async function logoutStudent() {
    if (currentStudent && supabase) {
      clearTimeout(cloudSaveTimer);
      await saveCloudProgress();
      try { await supabase.rpc("student_logout", { p_session_token: currentStudent.session_token }); }
      catch { /* The local session is still cleared when the connection is unavailable. */ }
    }
    localStorage.removeItem(sessionStorageKey);
    currentStudent = null;
    saved = loadProgress();
    currentIndex = Math.min(Math.max(saved.current || 0, 0), problems.length - 1);
    renderProblem();
    updateAccountButton();
    showToast("로그아웃했어요.");
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
    $("#tutor-error").disabled = lastTutorRun?.kind !== "error";
    $("#tutor-wrong").disabled = lastTutorRun?.kind !== "wrong";
  }

  function showTutorResponse(title, message) {
    $("#tutor-response-title").textContent = title;
    $("#tutor-response-body").textContent = message;
    $("#tutor-response").hidden = false;
  }

  function nextHintQuestion(problem, code, level) {
    const tags = problem.tags.join(" ");
    if (!code.trim() && level === 1) return "입력 조건에서 프로그램이 받아야 하는 값은 무엇인지 먼저 표시해 보세요.";
    if (tags.includes("반복문")) return level === 1 ? "몇 번 반복해야 하는지, 반복의 시작과 끝을 문제에서 찾아볼까요?" : "반복을 한 번 수행할 때 값이 어떻게 바뀌는지 예제로 따라가 보세요.";
    if (tags.includes("조건문")) return level === 1 ? "입력에 따라 나뉘는 경우를 두 가지로 나눠 말해볼까요?" : "조건이 참일 때와 거짓일 때 각각 어떤 결과가 나와야 하나요?";
    if (tags.includes("문자열")) return level === 1 ? "문자열의 어떤 부분을 바꾸거나 세어야 하는지 찾아보세요." : "문자열을 한 글자씩 살펴본다고 생각하고 순서를 적어보세요.";
    if (tags.includes("리스트")) return level === 1 ? "입력된 값들을 한 묶음으로 보고, 그중 어떤 값을 찾아야 하나요?" : "리스트의 각 값을 비교하거나 합치는 과정이 필요한지 생각해 보세요.";
    return level === 1 ? "입력, 처리, 출력 중 아직 코드로 옮기지 않은 단계가 있나요?" : "예제 입력을 손으로 계산해 보고, 필요한 계산 순서를 적어보세요.";
  }

  function showTutorHint() {
    const problem = problems[currentIndex];
    const code = editor.value;
    const level = Math.min(tutorHintLevels[currentIndex] || 0, 2);
    tutorHintLevels[currentIndex] = Math.min(level + 1, 3);
    const title = `생각 힌트 ${level + 1} / 3`;
    const message = level === 0
      ? `${problem.hint}\n\n먼저 생각해 볼 점: ${nextHintQuestion(problem, code, 1)}`
      : level === 1
        ? nextHintQuestion(problem, code, 2)
        : "예제 입력을 종이에 적고, 코드가 각 단계에서 어떤 값을 다루는지 하나씩 따라가 보세요. 정답 코드는 보여주지 않아요.";
    showTutorResponse(title, message);
  }

  function explainTutorError() {
    if (lastTutorRun?.kind !== "error") return;
    const error = lastTutorRun.message || "";
    const lower = error.toLowerCase();
    let explanation = "오류가 난 줄 주변에서 변수 이름, 입력 형식, 들여쓰기를 차례로 확인해 보세요.";
    if (lower.includes("syntax") || lower.includes("invalid syntax") || lower.includes("indent")) {
      explanation = "파이썬 문장 모양이나 들여쓰기가 맞지 않을 때 생기는 오류예요. 표시된 줄과 바로 앞 줄의 괄호, 따옴표, 콜론, 들여쓰기를 살펴보세요.";
    } else if (lower.includes("not defined") || lower.includes("nameerror")) {
      explanation = "아직 만들어지지 않은 이름을 사용했거나 변수 이름이 서로 다를 때 생겨요. 오류에 나온 이름이 앞에서 같은 철자로 정해졌는지 확인해 보세요.";
    } else if (lower.includes("invalid literal") || lower.includes("could not convert") || lower.includes("valueerror")) {
      explanation = "문자열을 숫자로 바꾸는 과정에서 숫자가 아닌 값이 들어왔을 수 있어요. 입력을 나누는 방법과 숫자로 바꾸는 위치를 확인해 보세요.";
    } else if (lower.includes("eof") || lower.includes("input")) {
      explanation = "준비된 입력보다 더 많이 읽으려 했을 수 있어요. 문제의 입력 줄 수와 코드에서 입력을 읽는 횟수를 비교해 보세요.";
    } else if (lower.includes("index") || lower.includes("out of range")) {
      explanation = "리스트나 문자열에 없는 위치를 꺼내려 했을 수 있어요. 위치 번호가 자료의 범위 안에 있는지 확인해 보세요.";
    } else if (lower.includes("division by zero")) {
      explanation = "0으로 나누려 해서 멈췄어요. 나누는 값이 0이 될 수 있는 경우를 먼저 확인해 보세요.";
    } else if (lower.includes("type") || lower.includes("unsupported operand")) {
      explanation = "서로 다른 종류의 값을 바로 계산하려 했을 수 있어요. 숫자와 문자열을 구분하고, 필요한 값이 알맞은 형태인지 살펴보세요.";
    }
    showTutorResponse("오류 설명", `${explanation}\n\n파이썬 메시지: ${error}`);
  }

  function analyzeTutorWrongAnswer() {
    if (lastTutorRun?.kind !== "wrong") return;
    const problem = problems[currentIndex];
    const code = editor.value;
    let question = "예제 입력의 가장 작은 값과 가장 큰 값에서도 결과가 맞는지 확인해 볼까요?";
    if (!/print\s*\(/.test(code)) question = "계산한 결과를 출력하는 부분이 있는지 먼저 확인해 보세요.";
    else if (!/input\s*\(/.test(code)) question = "문제에서 요구한 입력을 코드가 실제로 읽고 있는지 확인해 보세요.";
    else if (problem.tags.includes("반복문")) question = "반복 횟수와 마지막 반복에서의 결과가 문제의 조건과 일치하나요?";
    else if (problem.tags.includes("조건문")) question = "각 조건의 경계값에서 어느 쪽 분기가 실행되는지 직접 따라가 보세요.";
    else if (problem.tags.includes("문자열")) question = "문자열이 한 글자이거나 순서를 바꿔야 하는 경우도 생각해 봤나요?";
    showTutorResponse(
      "오답 점검",
      `${lastTutorRun.passed}개 테스트를 통과했고 ${lastTutorRun.total - lastTutorRun.passed}개에서 결과가 달랐어요. 숨겨진 입력과 정답은 보여주지 않아요.\n\n먼저 확인할 질문: ${question}`
    );
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
  $("#tutor-hint").addEventListener("click", showTutorHint);
  $("#tutor-error").addEventListener("click", explainTutorError);
  $("#tutor-wrong").addEventListener("click", analyzeTutorWrongAnswer);
  $("#tutor-close").addEventListener("click", () => { $("#tutor-response").hidden = true; });
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
    if (currentStudent) {
      await logoutStudent();
      return;
    }
    setAccountMode("login");
    accountDialog.showModal();
  });
  $("#account-dialog-close").addEventListener("click", () => accountDialog.close());
  accountDialog.addEventListener("close", () => {
    if (!$("#recovery-panel").hidden) $("#recovery-code").textContent = "";
    $("#account-pin").value = "";
    $("#recovery-input").value = "";
    setAccountMode("login");
  });
  $("#account-form").addEventListener("submit", submitAccountForm);
  $("#account-switch").addEventListener("click", () => {
    setAccountMode(accountMode === "reset" ? "login" : accountMode === "signup" ? "login" : "signup");
  });
  $("#forgot-pin-button").addEventListener("click", () => setAccountMode("reset"));
  $("#copy-recovery-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#recovery-code").textContent);
      showToast("복구 코드를 복사했어요.");
    } catch {
      showToast("복구 코드를 직접 적어 안전하게 보관해 주세요.");
    }
  });

  renderList();
  renderProblem();
  updateAccountButton();
  startAuth();
})();
