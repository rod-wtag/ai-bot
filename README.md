# 🤖 AI Code Review Bot

This repository provides a **GitHub Action + AI-powered code review bot**.  
When you open or update a Pull Request, the bot analyzes the changes and adds AI-generated review comments automatically.

---

## 📦 Features
- Automatically runs on each Pull Request (`pull_request` event).  
- Sends the **diff** of the PR to an AI model.  
- Posts AI-generated feedback as a PR comment.  
- Supports **Hugging Face Inference API models** (e.g. `HuggingFaceH4/zephyr-7b-beta`, `mistralai/Mixtral-8x7B-Instruct-v0.1`, `meta-llama/Llama-3.1-8B-Instruct`, etc.).

---

## 🔑 Setup

### 1. Get a Hugging Face API Token
1. Create a free account at [Hugging Face](https://huggingface.co).  
2. Go to your profile → **Settings → Access Tokens**.  
3. Generate a **new API token** with `read` permissions.  
   Example:  
