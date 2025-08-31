import { execSync } from "child_process";
import axios from "axios";
import { Octokit } from "@octokit/rest";

// === 1. Setup GitHub + HuggingFace ===
const githubToken = process.env.GITHUB_TOKEN;
const hfToken = process.env.HF_TOKEN;
const prNumber = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;

if (!githubToken || !hfToken) {
  console.error(":x: Missing GITHUB_TOKEN or HF_TOKEN");
  process.exit(1);
}

const [owner, repoName] = repo.split("/");
const octokit = new Octokit({ auth: githubToken });

// === 2. Get PR diff ===
let diff;
try {
  diff = execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber} && git diff origin/main...pr-${prNumber}`, {
    encoding: "utf-8",
  });
  
  if (!diff || diff.trim().length === 0) {
    console.log(":warning: No diff found - PR may be empty or already merged");
    process.exit(0);
  }
  
  // Limit diff size to avoid token limits
  if (diff.length > 10000) {
    diff = diff.substring(0, 10000) + "\n\n... (diff truncated due to length)";
  }
} catch (err) {
  console.error(":x: Failed to fetch PR diff:", err.message);
  process.exit(1);
}

// === 3. Send diff to Hugging Face model with proper API format ===
async function getAIReview() {
  try {
    console.log(":robot_face: Sending request to Hugging Face...");
    
    // Use a text generation model that's available for inference API
    // CodeLlama is a good choice for code review
    const MODEL_ID = "codellama/CodeLlama-7b-hf"; // You can also try "bigcode/starcoder" or other code-specific models
    
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${MODEL_ID}`,
      {
        inputs: `You are a senior code reviewer. Please review the following code diff and provide specific, helpful feedback on potential bugs, security issues, and code quality improvements:\n\n\`\`\`diff\n${diff}\n\`\`\`\n\nYour review:`,
        parameters: {
          max_new_tokens: 1000,
          temperature: 0.3,
          return_full_text: false
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${hfToken}`
        }
      }
    );
    
    console.log(":white_check_mark: AI response received");
    
    // Extract the generated text
    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0].generated_text;
    } else if (response.data.generated_text) {
      return response.data.generated_text;
    } else {
      console.log("Unexpected API response format:", JSON.stringify(response.data));
      return "AI review service returned an unexpected response format. Please review this PR manually.";
    }
  } catch (err) {
    console.error(":x: AI request failed:", err.message);
    if (err.response) {
      console.error("API response:", JSON.stringify(err.response.data));
    }
    
    // Fallback response
    return ":warning: AI review service temporarily unavailable. Please review this PR manually.";
  }
}

// === 4. Post review as PR comment ===
async function main() {
  try {
    const aiResponse = await getAIReview();
    
    await octokit.issues.createComment({
      owner,
      repo: repoName,
      issue_number: parseInt(prNumber),
      body: `:robot_face: **AI Code Review**\n\n${aiResponse}`,
    });
    console.log(":white_check_mark: AI review posted successfully!");
  } catch (err) {
    console.error(":x: Failed to post PR comment:", err.message);
    process.exit(1);
  }
}

main();