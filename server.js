const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Parse JSON
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Questions API
app.post("/api/questions", async (req, res) => {
  try {
    const { subject, type, difficulty, count } = req.body;

    res.json({
      questions: [
        {
          prompt: `Explain a ${difficulty} concept in ${subject}`,
          focus: `Interview Type: ${type}`
        },
        {
          prompt: `What are the applications of ${subject}?`,
          focus: "Real world examples"
        }
      ].slice(0, count || 2)
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate questions"
    });
  }
});

// Evaluation API
app.post("/api/evaluate", async (req, res) => {
  try {
    res.json({
      level: "Good",
      score: 80,
      feedback: "Good answer with decent explanation.",
      strength: "Clear communication",
      improvement: "Add more technical detail"
    });
  } catch (error) {
    res.status(500).json({
      error: "Evaluation failed"
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
