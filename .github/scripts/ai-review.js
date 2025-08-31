import { execSync } from "child_process";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";

// === 1. Setup GitHub + HuggingFace ===
const githubToken = process.env.GITHUB_TOKEN;
const hfToken = process.env.HF_TOKEN;
const prNumber = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;

if (!githubToken || !hfToken) {
  console.error("❌ Missing GITHUB_TOKEN or HF_TOKEN");
  process.exit(1);
}

const [owner, repoName] = repo.split("/");
const octokit = new Octokit({ auth: githubToken });

// Hugging Face OpenAI-compatible client with better error handling
const client = new OpenAI({
  baseURL: "https://api-inference.huggingface.co/v1",
  apiKey: hfToken,
});

// === 2. Get PR diff ===
let diff;
try {
  diff = execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber} && git diff origin/main...pr-${prNumber}`, {
    encoding: "utf-8",
  });
  
  if (!diff || diff.trim().length === 0) {
    console.log("⚠️ No diff found - PR may be empty or already merged");
    process.exit(0);
  }
  
  // Limit diff size to avoid token limits
  if (diff.length > 10000) {
    diff = diff.substring(0, 10000) + "\n\n... (diff truncated due to length)";
  }
} catch (err) {
  console.error("❌ Failed to fetch PR diff:", err.message);
  process.exit(1);
}

// === 3. Send diff to AI with improved error handling ===
let aiResponse;
try {
  console.log("🤖 Sending request to Hugging Face...");
  
  const completion = await client.chat.completions.create({
    model: "microsoft/codereviewer", // More reliable model
    messages: [
      {
        role: "system",
        content: "You are a senior code reviewer. Provide constructive, concise feedback on code diffs. Focus on potential bugs, security issues, performance concerns, and code quality improvements.",
      },
      {
        role: "user",
        content: `Please review this pull request diff and suggest improvements:\n\n\`\`\`diff\n${diff}\n\`\`\``,
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
    stream: false,
  });

  aiResponse = completion.choices[0]?.message?.content;
  
  if (!aiResponse) {
    throw new Error("No response content received from AI");
  }
  
  console.log("✅ AI response received");
} catch (err) {
  console.error("❌ AI request failed:", err);
  console.error("Full error details:", JSON.stringify(err, null, 2));
  
  // Fallback response
  aiResponse = "⚠️ AI review service temporarily unavailable. Please review this PR manually.";
}

// === 4. Post review as PR comment ===
try {
  await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: parseInt(prNumber),
    body: `🤖 **AI Code Review**\n\n${aiResponse}`,
  });
  console.log("✅ AI review posted successfully!");
} catch (err) {
  console.error("❌ Failed to post PR comment:", err.message);
  process.exit(1);
}

