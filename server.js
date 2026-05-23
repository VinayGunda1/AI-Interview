const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/questions", async (req, res) => {
  try {
    const questions = await generateQuestions(req.body);
    res.json({ questions });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Failed to generate questions"
    });
  }
});

app.post("/api/evaluate", async (req, res) => {
  try {
    const evaluation = await evaluateAnswer(req.body);
    res.json(evaluation);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Failed to evaluate answer"
    });
  }
});

async function generateQuestions({ subject, type, difficulty, count }) {
  assertApiKey();

  const safeCount = Math.max(1, Math.min(10, Number(count) || 5));

  const prompt = `
Generate ${safeCount} fresh mock interview questions.

Subject: ${subject}
Interview type: ${type}
Difficulty: ${difficulty}

Return only JSON in this format:
{
  "questions": [
    {
      "prompt": "question text",
      "focus": "short guidance"
    }
  ]
}
`;

  const data = await callGemini({
    instructions:
      "You are an AI interview generator. Create clear and useful interview questions.",
    input: prompt,
    maxOutputTokens: 1200
  });

  const parsed = parseJsonText(data);

  return parsed.questions || [];
}

async function evaluateAnswer({
  subject,
  type,
  difficulty,
  question,
  answer
}) {
  assertApiKey();

  const prompt = `
Evaluate this interview answer.

Subject: ${subject}
Interview type: ${type}
Difficulty: ${difficulty}

Question:
${question}

Answer:
${answer}

Return only JSON in this format:
{
  "level": "Good",
  "score": 80,
  "feedback": "feedback text",
  "strength": "one strength",
  "improvement": "one improvement"
}
`;

  const data = await callGemini({
    instructions:
      "You are a friendly AI interviewer. Give simple and helpful feedback.",
    input: prompt,
    maxOutputTokens: 700
  });

  const parsed = parseJsonText(data);

  return {
    level: parsed.level || "Average",
    score: parsed.score || 50,
    feedback:
      parsed.feedback || "Good attempt. Keep practicing.",
    strength:
      parsed.strength || "You answered the question.",
    improvement:
      parsed.improvement || "Add more detail."
  };
}

async function callGemini({
  instructions,
  input,
  maxOutputTokens
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input }]
          }
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Gemini API request failed"
    );
  }

  const text = extractOutputText(data);

  if (!text) {
    throw new Error("No AI response received");
  }

  return text;
}

function extractOutputText(data) {
  return (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("\n");
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("Invalid AI JSON response");
  }
}

function assertApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
