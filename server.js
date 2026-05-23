const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

loadEnvFile();

const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = app;



const PORT = Number(process.env.PORT || 5500);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ROOT = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/questions") {
      const body = await readJson(req);
      const questions = await generateQuestions(body);
      sendJson(res, 200, { questions });
      return;
    }

    if (req.method === "POST" && req.url === "/api/evaluate") {
      const body = await readJson(req);
      const evaluation = await evaluateAnswer(body);
      sendJson(res, 200, evaluation);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error.message || error);
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Something went wrong."
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI Mock Interview running at http://127.0.0.1:${PORT}`);
});

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(makeError("Request too large", 413));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(makeError("Invalid JSON", 400));
      }
    });
  });
}

async function generateQuestions({ subject, type, difficulty, count }) {
  assertApiKey();
  const safeCount = Math.max(1, Math.min(10, Number(count) || 5));
  const prompt = [
    `Generate ${safeCount} fresh and random mock interview questions.`,
    `Subject: ${subject}`,
    `Interview type: ${type}`,
    `Difficulty: ${difficulty}`,
    "Do not use a fixed or memorized list. Create new questions dynamically.",
    "Return only JSON in this exact shape:",
    '{"questions":[{"prompt":"question text","focus":"short guidance for answering"}]}'
  ].join("\n");

  const data = await callGemini({
    instructions: "You create fresh interview questions for students. Keep questions clear, varied, and suitable for the selected difficulty.",
    input: prompt,
    maxOutputTokens: 1200
  });

  const parsed = parseJsonText(data);
  if (!Array.isArray(parsed.questions)) {
    throw makeError("AI returned questions in an unexpected format.", 502);
  }

  return parsed.questions
    .filter((item) => item && item.prompt)
    .slice(0, safeCount)
    .map((item) => ({
      prompt: String(item.prompt),
      focus: String(item.focus || "Answer with meaning, key points, and one example.")
    }));
}

async function evaluateAnswer({ subject, type, difficulty, question, answer }) {
  assertApiKey();
  const prompt = [
    "Evaluate this mock interview answer simply and kindly.",
    `Subject: ${subject}`,
    `Interview type: ${type}`,
    `Difficulty: ${difficulty}`,
    `Question: ${question}`,
    `Student answer: ${answer}`,
    "Use simple evaluation, not strict keyword matching.",
    "Return only JSON in this exact shape:",
    '{"level":"Good | Average | Needs practice","score":75,"feedback":"short feedback","strength":"one strength","improvement":"one improvement"}'
  ].join("\n");

  const data = await callGemini({
    instructions: "You are a friendly mock interview evaluator. Be simple, fair, and helpful. Do not be harsh.",
    input: prompt,
    maxOutputTokens: 700
  });

  const parsed = parseJsonText(data);
  return {
    level: String(parsed.level || "Average"),
    score: Number(parsed.score || 50),
    feedback: String(parsed.feedback || "Good attempt. Keep practicing with clearer examples."),
    strength: String(parsed.strength || "You attempted the question."),
    improvement: String(parsed.improvement || "Add more detail and one example.")
  };
}

async function callGemini({ instructions, input, maxOutputTokens }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
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
        temperature: 0.95,
        maxOutputTokens: maxOutputTokens,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw makeError(data.error?.message || "Gemini API request failed.", response.status);
  }

  const text = extractOutputText(data);
  if (!text) {
    throw makeError("Gemini did not return text.", 502);
  }

  return text;
}

function extractOutputText(data) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n");
}

function parseJsonText(text) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);

  try {
    return JSON.parse(jsonText);
  } catch {
    throw makeError("AI returned invalid JSON. Please try again.", 502);
  }
}

function assertApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw makeError("Missing GEMINI_API_KEY. Set your Gemini API key before starting the server.", 500);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function makeError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}
