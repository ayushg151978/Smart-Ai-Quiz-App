// Load the Gemini SDK from a CDN so it works without npm
import { GoogleGenAI, Type } from "https://esm.run/@google/genai";

// --- State ---
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let timeLeft = 0;
let timerInterval = null;
let quizHistory = JSON.parse(localStorage.getItem('quiz_history') || '[]');

// --- API Key Handling ---
// In this environment, we use process.env.GEMINI_API_KEY. 
// If you run this locally, you can replace this with your actual key string.
const API_KEY = "YOUR_GEMINI_API_KEY"


if (!API_KEY) {
  console.error("Gemini API Key not found. Please provide an API key to use the quiz.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- DOM Elements ---
const views = {
  config: document.getElementById('config-view'),
  quiz: document.getElementById('quiz-view'),
  result: document.getElementById('result-view'),
  history: document.getElementById('history-view')
};

const topicInput = document.getElementById('topic-input');
const numQuestionsSelect = document.getElementById('num-questions');
const difficultySelect = document.getElementById('difficulty');
const timeLimitSelect = document.getElementById('time-limit');
const startBtn = document.getElementById('start-btn');
const historyBtn = document.getElementById('history-btn');

const displayTopic = document.getElementById('display-topic');
const displayDifficulty = document.getElementById('display-difficulty');
const timerDisplay = document.getElementById('timer');
const progressCircle = document.getElementById('progress-circle');
const progressFill = document.getElementById('progress-fill');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const voiceBtn = document.getElementById("voice-btn");

const resultSummary = document.getElementById('result-summary');
const scorePercent = document.getElementById('score-percent');
const scoreFill = document.getElementById('score-fill');
const reviewContainer = document.getElementById('review-container');
const restartBtn = document.getElementById('restart-btn');
const viewHistoryBtn = document.getElementById('view-history-btn');

const historyList = document.getElementById('history-list');
const historyBackBtn = document.getElementById('history-back-btn');
const unansweredPdfBtn = document.getElementById("download-unanswered-pdf");
const answeredPdfBtn = document.getElementById("download-answered-pdf");

// --- Navigation ---
function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

// --- Quiz Logic ---
async function startQuiz() {
  const topic = topicInput.value.trim();
  if (!topic) return alert('Please enter a topic');

const num = Number(numQuestionsSelect.value);

if (!num || num < 1) {
  alert("Please enter number of questions");
  return;
}
  const diff = difficultySelect.value;
 const time = Number(timeLimitSelect.value);

if (!time || time < 1) {
  alert("Please enter a valid time in minutes");
  return;
};

  setLoading(true);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a quiz about "${topic}" with ${num} questions at a ${diff} difficulty level. 
      Each question must have exactly 4 options.
      Return the result as a JSON array of objects with the following schema:
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "correctAnswer": "string (must exactly match one of the options)",
        "explanation": "string (detailed explanation)"
      }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    });

    questions = JSON.parse(response.text || '[]');
    userAnswers = new Array(questions.length).fill(null);
    currentQuestionIndex = 0;
    timeLeft = time * 60;

    displayTopic.textContent = topic;
    displayDifficulty.textContent = diff;
    
    renderQuestion();
    startTimer();
    showView('quiz');
  } catch (error) {
    console.error(error);
    alert('Failed to generate quiz. Please try again.');
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  startBtn.disabled = isLoading;
  startBtn.querySelector('.btn-text').classList.toggle('hidden', isLoading);
  startBtn.querySelector('.loader').classList.toggle('hidden', !isLoading);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitQuiz();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (timeLeft < 30) timerDisplay.style.color = 'var(--error)';
  else timerDisplay.style.color = 'var(--text)';
}

function renderQuestion() {
  const q = questions[currentQuestionIndex];
  questionText.textContent = q.question;
  progressCircle.textContent = `${currentQuestionIndex + 1}/${questions.length}`;
  progressFill.style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;

  optionsContainer.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    if (userAnswers[currentQuestionIndex] === opt) btn.classList.add('selected');
    btn.innerHTML = `<span>${opt}</span>`;
    btn.onclick = () => {
      userAnswers[currentQuestionIndex] = opt;
      renderQuestion();
    };
    optionsContainer.appendChild(btn);
  });

  backBtn.style.visibility = currentQuestionIndex === 0 ? 'hidden' : 'visible';
  nextBtn.textContent = currentQuestionIndex === questions.length - 1 ? 'Submit Quiz' : 'Next';
}

function submitQuiz() {
  if (timerInterval) clearInterval(timerInterval);
  
  const score = questions.reduce((acc, q, idx) => {
    return acc + (userAnswers[idx] === q.correctAnswer ? 1 : 0);
  }, 0);

  const attempt = {
    id: Date.now(),
    topic: topicInput.value,
    score,
    total: questions.length,
    date: new Date().toLocaleString(),
    difficulty: difficultySelect.value,
    questions,
    userAnswers
  };

  quizHistory.unshift(attempt);
  localStorage.setItem('quiz_history', JSON.stringify(quizHistory));

  showResults(attempt);
  fetch("http://localhost:5000/saveQuiz",{
  method:"POST",
  headers:{
    "Content-Type":"application/json"
  },
  body:JSON.stringify(attempt)
})
}
async function generateStudyInsights(attempt) {
  const wrongQuestions = attempt.questions
    .map((q, i) => ({
      question: q.question,
      correct: q.correctAnswer,
      user: attempt.userAnswers[i]
    }))
    .filter(item => item.user !== item.correct);

  if (wrongQuestions.length === 0) {
    return "Great job! You answered everything correctly.";
  }

const prompt = `
A student attempted a quiz on "${attempt.topic}".

Here are the questions they answered incorrectly:
${JSON.stringify(wrongQuestions, null, 2)}

Based on these mistakes, suggest 3-5 subtopics for further practice.

IMPORTANT:
Return ONLY the topic names.
Do NOT include explanations.
Give topics names pointwise.
Return each topic on a new line.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text;
}

function showResults(attempt) {
  generateStudyInsights(attempt).then(insights => {

    const insightBox = document.createElement("div");
    insightBox.className = "card";

    insightBox.innerHTML = `
      <h3>📚 Recommended Topics for Practice</h3>
      <p>${insights}</p>
    `;

    document.querySelector(".result-card").appendChild(insightBox);

  });

  
  const percentage = Math.round((attempt.score / attempt.total) * 100);
  resultSummary.textContent = `You scored ${attempt.score} out of ${attempt.total}`;
  scorePercent.textContent = `${percentage}%`;
  
  // Animate ring
  const offset = 283 - (283 * percentage) / 100;
  scoreFill.style.strokeDashoffset = offset;

  reviewContainer.innerHTML = '<h3>Review Answers</h3>';
  attempt.questions.forEach((q, idx) => {
    const isCorrect = attempt.userAnswers[idx] === q.correctAnswer;
    const item = document.createElement('div');
    item.className = 'review-item';
    item.innerHTML = `
      <div class="review-header">
        <h4 style="font-weight: 700;">${q.question}</h4>
        <span class="badge ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.875rem;">
        <div style="color: ${isCorrect ? 'var(--success)' : 'var(--error)'}">
          <strong>Your Answer:</strong><br>${attempt.userAnswers[idx] || 'No answer'}
        </div>
        <div style="color: var(--primary)">
          <strong>Correct Answer:</strong><br>${q.correctAnswer}
        </div>
      </div>
      <div class="explanation">
        <strong>Explanation:</strong> ${q.explanation}
      </div>
    `;
    reviewContainer.appendChild(item);
  });

  showView('result');}


function renderHistory() {
  historyList.innerHTML = '';
  if (quizHistory.length === 0) {
    historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No history found.</p>';
  } else {
    quizHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.onclick = () => showResults(item);
      div.innerHTML = `
        <div class="history-info">
          <h3>${item.topic}</h3>
          <p>${item.date} • ${item.difficulty}</p>
        </div>
        <div class="history-score">
          <span>${item.score}/${item.total}</span>
          <small>${Math.round((item.score / item.total) * 100)}%</small>
        </div>
      `;
      historyList.appendChild(div);
    });
  }
  showView('history');
}

// --- Event Listeners ---
startBtn.onclick = startQuiz;
historyBtn.onclick = renderHistory;
historyBackBtn.onclick = () => showView('config');
restartBtn.onclick = () => showView('config');
viewHistoryBtn.onclick = renderHistory;

backBtn.onclick = () => {
  currentQuestionIndex--;
  renderQuestion();
};

nextBtn.onclick = () => {
  if (currentQuestionIndex === questions.length - 1) {
    submitQuiz();
  } else {
    currentQuestionIndex++;
    renderQuestion();
  }
};


voiceBtn.onclick = () => {

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.start();

  recognition.onresult = (event) => {

    const speechResult = event.results[0][0].transcript.toLowerCase();

    const q = questions[currentQuestionIndex];

    const matched = q.options.find(opt =>
      speechResult.includes(opt.toLowerCase())
    );

    if (matched) {
      userAnswers[currentQuestionIndex] = matched;
      renderQuestion();
    } else {
      alert("Could not match your voice to any option.");
    }

  };

};

unansweredPdfBtn.onclick = ()=>{
  downloadUnansweredPDF(quizHistory[0]);
}

answeredPdfBtn.onclick = ()=>{
  downloadAnsweredPDF(quizHistory[0]);
}
function downloadUnansweredPDF(attempt){

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 10;

  doc.text(`Quiz Topic: ${attempt.topic}`,10,y);
  y+=10;

  attempt.questions.forEach((q,i)=>{

    doc.text(`${i+1}. ${q.question}`,10,y);
    y+=8;

    q.options.forEach(opt=>{
      doc.text(`- ${opt}`,15,y);
      y+=6;
    });

    y+=6;

    if(y>270){
      doc.addPage();
      y=10;
    }

  });

  doc.save("quiz_unanswered.pdf");

}


function downloadAnsweredPDF(attempt){

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 10;

  doc.text(`Quiz Topic: ${attempt.topic}`,10,y);
  y+=10;

  attempt.questions.forEach((q,i)=>{

    doc.text(`${i+1}. ${q.question}`,10,y);
    y+=8;

    q.options.forEach(opt=>{
      doc.text(`- ${opt}`,15,y);
      y+=6;
    });

    doc.text(`Correct Answer: ${q.correctAnswer}`,10,y);
    y+=6;

    doc.text(`Explanation: ${q.explanation}`,10,y);
    y+=8;

    if(y>270){
      doc.addPage();
      y=10;
    }

  });

  doc.save("quiz_answered.pdf");

}

