import OpenAI from "openai";

const hfToken = process.env.HF_TOKEN;

if (!hfToken) {
  console.error("❌ HF_TOKEN not found");
  process.exit(1);
}

console.log("🔍 Testing HuggingFace connection...");
console.log("Token format:", hfToken.startsWith("hf_") ? "✅ Correct" : "❌ Should start with 'hf_'");

const client = new OpenAI({
  baseURL: "https://api-inference.huggingface.co/v1",
  apiKey: hfToken,
});

// Test 1: List available models
console.log("\n📋 Testing model list...");
try {
  const models = await client.models.list();
  console.log("✅ Models endpoint working");
  console.log("Available models count:", models.data?.length || 0);
} catch (err) {
  console.error("❌ Models list failed:", err.message);
  console.error("Status:", err.status);
}

// Test 2: Simple chat completion
console.log("\n💬 Testing chat completion...");
const testModels = [
  "meta-llama/Llama-3.2-1B-Instruct",
  "microsoft/DialoGPT-medium", 
  "HuggingFaceH4/zephyr-7b-beta",
  "meta-llama/Llama-3.2-3B-Instruct"
];

for (const model of testModels) {
  try {
    console.log(`\n🧪 Testing ${model}...`);
    
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: "user",
          content: "Say 'Hello' in exactly one word.",
        },
      ],
      max_tokens: 5,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content;
    console.log(`✅ ${model} works: "${response}"`);
    break; // Use the first working model
  } catch (err) {
    console.error(`❌ ${model} failed:`, err.message);
    if (err.status) console.error(`   Status: ${err.status}`);
  }
}

// Test 3: Check token permissions
console.log("\n🔐 Testing token permissions...");
try {
  const response = await fetch("https://huggingface.co/api/whoami", {
    headers: { Authorization: `Bearer ${hfToken}` }
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log("✅ Token valid for user:", data.name);
    console.log("Token type:", data.type);
  } else {
    console.error("❌ Token validation failed:", response.status);
  }
} catch (err) {
  console.error("❌ Token check failed:", err.message);
}