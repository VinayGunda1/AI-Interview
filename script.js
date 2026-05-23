const subjects = ["AI", "ML", "DL", "SQL", "Python", "C", "OOPs"];
const interviewTypes = ["Technical", "Concept", "Viva"];
const difficulties = ["Easy", "Medium", "Hard"];

const state = {
  subject: "Python",
  type: "Technical",
  difficulty: "Easy",
  questions: [],
  answers: [],
  currentIndex: 0,
  startedAt: null,
  timerId: null
};

const setupPanel = document.querySelector("#setupPanel");
const interviewPanel = document.querySelector("#interviewPanel");
const resultsPanel = document.querySelector("#resultsPanel");
const setupForm = document.querySelector("#setupForm");
const subjectChoices = document.querySelector("#subjectChoices");
const typeChoices = document.querySelector("#typeChoices");
const difficultyChoices = document.querySelector("#difficultyChoices");
const questionCount = document.querySelector("#questionCount");
const sessionMeta = document.querySelector("#sessionMeta");
const interviewTitle = document.querySelector("#interviewTitle");
const timer = document.querySelector("#timer");
const progressFill = document.querySelector("#progressFill");
const questionCounter = document.querySelector("#questionCounter");
const questionText = document.querySelector("#questionText");
const questionNote = document.querySelector("#questionNote");
const answerInput = document.querySelector("#answerInput");
const submitAnswer = document.querySelector("#submitAnswer");
const skipQuestion = document.querySelector("#skipQuestion");
const exitInterview = document.querySelector("#exitInterview");
const restartInterview = document.querySelector("#restartInterview");
const aiHint = document.querySelector("#aiHint");

function createChoices(container, values, activeValue, onSelect) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = value;
    button.className = container.classList.contains("choice-grid") ? "choice-button" : "segment-button";
    button.classList.toggle("active", value === activeValue);
    button.addEventListener("click", () => onSelect(value));
    container.appendChild(button);
  });
}

function renderSetupChoices() {
  createChoices(subjectChoices, subjects, state.subject, (value) => {
    state.subject = value;
    renderSetupChoices();
  });

  createChoices(typeChoices, interviewTypes, state.type, (value) => {
    state.type = value;
    renderSetupChoices();
  });

  createChoices(difficultyChoices, difficulties, state.difficulty, (value) => {
    state.difficulty = value;
    renderSetupChoices();
  });
}

async function startInterview() {
  const startButton = setupForm.querySelector(".primary-action");
  setButtonLoading(startButton, "Generating AI questions...");

  try {
    state.questions = await generateQuestions();
    state.answers = [];
    state.currentIndex = 0;
    state.startedAt = Date.now();
    setupPanel.classList.add("hidden");
    resultsPanel.classList.add("hidden");
    interviewPanel.classList.remove("hidden");
    sessionMeta.textContent = `${state.subject} | ${state.type} | ${state.difficulty}`;
    interviewTitle.textContent = `${state.subject} Mock Interview`;
    startTimer();
    renderQuestion();
  } catch (error) {
    showSetupError(error.message);
  } finally {
    resetButton(startButton, "Start Interview", "->");
  }
}

async function generateQuestions() {
  const response = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: state.subject,
      type: state.type,
      difficulty: state.difficulty,
      count: Number(questionCount.value)
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not generate questions. Check your API key and server.");
  }

  return data.questions.map((question, index) => ({
    id: `${Date.now()}-${index}`,
    prompt: question.prompt,
    focus: question.focus || "Answer clearly and give a simple example if possible."
  }));
}

function startTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    timer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const progress = (state.currentIndex / state.questions.length) * 100;
  progressFill.style.width = `${progress}%`;
  questionCounter.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  questionText.textContent = question.prompt;
  questionNote.textContent = question.focus;
  answerInput.value = "";
  answerInput.disabled = false;
  submitAnswer.disabled = false;
  skipQuestion.disabled = false;
  resetButton(submitAnswer, "Submit Answer");
  resetButton(skipQuestion, "Skip");
  answerInput.focus();
  aiHint.textContent = getAiHint();
}

function getAiHint() {
  const hints = [
    "A clear answer is better than a long confused one.",
    "Try: meaning, key points, and one example.",
    "It is okay to answer simply. The AI will guide improvement.",
    "Use your own words. Interviewers value clarity."
  ];
  return hints[Math.floor(Math.random() * hints.length)];
}

async function submitCurrentAnswer(skipped = false) {
  const answer = skipped ? "" : answerInput.value.trim();
  const question = state.questions[state.currentIndex];
  setQuestionLoading(skipped ? "Skipping..." : "Evaluating...");

  try {
    const evaluation = skipped
      ? createSkippedEvaluation(question)
      : await evaluateAnswer(question, answer);

    state.answers.push(evaluation);

    if (state.currentIndex === state.questions.length - 1) {
      finishInterview();
      return;
    }

    state.currentIndex += 1;
    renderQuestion();
  } catch (error) {
    aiHint.textContent = error.message;
    answerInput.disabled = false;
    submitAnswer.disabled = false;
    skipQuestion.disabled = false;
    resetButton(submitAnswer, "Submit Answer");
  }
}

async function evaluateAnswer(question, answer) {
  if (!answer) {
    return createSkippedEvaluation(question);
  }

  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: state.subject,
        type: state.type,
        difficulty: state.difficulty,
        question: question.prompt,
        answer
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not evaluate the answer.");
    }

    return {
      question: question.prompt,
      answer,
      score: clampScore(data.score),
      level: data.level || getLevelFromScore(data.score),
      feedback: data.feedback || "Good attempt. Keep practicing with clearer examples.",
      strength: data.strength || "You attempted the question.",
      improvement: data.improvement || "Add more detail and one example."
    };
  } catch (error) {
    console.warn("AI evaluation failed. Using local fallback.", error);
    return createLocalEvaluation(question, answer);
  }
}

function createSkippedEvaluation(question) {
  return {
    question: question.prompt,
    answer: "",
    score: 0,
    level: "Skipped",
    feedback: "Skipped question. Try to write at least a short answer.",
    strength: "You moved through the session.",
    improvement: "Attempt every question, even if you only know the basic idea."
  };
}

function createLocalEvaluation(question, answer) {
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const hasExample = /\b(example|for instance|such as|suppose|e\.g\.)\b/i.test(answer);
  const hasStructure = /(\n|first|second|finally|because|therefore|also)/i.test(answer);
  let score = 35;

  if (wordCount >= 20) score += 20;
  if (wordCount >= 45) score += 15;
  if (hasExample) score += 10;
  if (hasStructure) score += 10;

  const finalScore = clampScore(score);
  const level = getLevelFromScore(finalScore);

  return {
    question: question.prompt,
    answer,
    score: finalScore,
    level,
    feedback: "Submitted. Gemini evaluation was unavailable, so a simple local score was used.",
    strength: wordCount >= 20 ? "You wrote a meaningful answer." : "You attempted the question.",
    improvement: hasExample ? "Add a little more depth." : "Add one example to make the answer stronger."
  };
}

function clampScore(score) {
  const numeric = Number(score);
  if (Number.isNaN(numeric)) return 50;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getLevelFromScore(score) {
  const numeric = clampScore(score);
  if (numeric >= 75) return "Good";
  if (numeric >= 50) return "Average";
  return "Needs practice";
}

function setQuestionLoading(label) {
  answerInput.disabled = true;
  submitAnswer.disabled = true;
  skipQuestion.disabled = true;
  setButtonLoading(submitAnswer, label);
}

function setButtonLoading(button, label) {
  button.dataset.originalText = button.textContent;
  button.textContent = label;
  button.disabled = true;
}

function resetButton(button, label, icon = "") {
  button.disabled = false;
  button.innerHTML = icon ? `${label} <span aria-hidden="true">${icon}</span>` : label;
}

function showSetupError(message) {
  aiHint.textContent = message;
  alert(message);
}

function finishInterview() {
  clearInterval(state.timerId);
  progressFill.style.width = "100%";
  interviewPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  renderResults();
}

function renderResults() {
  const total = state.answers.reduce((sum, item) => sum + item.score, 0);
  const average = Math.round(total / state.answers.length);
  const scoreRing = document.querySelector("#scoreRing");
  const overallScore = document.querySelector("#overallScore");
  const scoreSummary = document.querySelector("#scoreSummary");
  const scoreDetails = document.querySelector("#scoreDetails");
  const strengthList = document.querySelector("#strengthList");
  const improvementList = document.querySelector("#improvementList");
  const feedbackItems = document.querySelector("#feedbackItems");

  overallScore.textContent = average;
  scoreRing.style.background = `conic-gradient(var(--accent) ${average * 3.6}deg, var(--soft) 0deg)`;
  scoreSummary.textContent = getScoreSummary(average);
  scoreDetails.textContent = `You completed ${state.answers.length} ${state.subject} questions at ${state.difficulty} difficulty.`;

  strengthList.innerHTML = buildStrengths().map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  improvementList.innerHTML = buildImprovements().map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  feedbackItems.innerHTML = state.answers.map((item, index) => `
    <article class="feedback-item">
      <span class="feedback-meta">Question ${index + 1} | ${escapeHtml(item.level)} | ${item.score}/100</span>
      <h4>${escapeHtml(item.question)}</h4>
      <p>${escapeHtml(item.feedback)}</p>
      <p><strong>Strength:</strong> ${escapeHtml(item.strength)}</p>
      <p><strong>Improve:</strong> ${escapeHtml(item.improvement)}</p>
    </article>
  `).join("");
}

function getScoreSummary(score) {
  if (score >= 80) return "Excellent interview readiness";
  if (score >= 60) return "Good foundation";
  if (score >= 40) return "Needs more practice";
  return "Start with the basics";
}

function buildStrengths() {
  const strengths = state.answers
    .filter((item) => item.score > 0)
    .map((item) => item.strength)
    .filter(Boolean);

  return [...new Set(strengths)].slice(0, 4).concat(
    strengths.length ? [] : ["You completed the session and can now see what to improve."]
  );
}

function buildImprovements() {
  const improvements = state.answers
    .map((item) => item.improvement)
    .filter(Boolean);

  return [...new Set(improvements)].slice(0, 4);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startInterview();
});

submitAnswer.addEventListener("click", () => submitCurrentAnswer(false));
skipQuestion.addEventListener("click", () => submitCurrentAnswer(true));
answerInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    submitCurrentAnswer(false);
  }
});

exitInterview.addEventListener("click", () => {
  clearInterval(state.timerId);
  interviewPanel.classList.add("hidden");
  setupPanel.classList.remove("hidden");
});

restartInterview.addEventListener("click", () => {
  resultsPanel.classList.add("hidden");
  setupPanel.classList.remove("hidden");
});

renderSetupChoices();
