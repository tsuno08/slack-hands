#!/usr/bin/env node

import { loadConfig, validateConfig } from "../src/config";

console.log("🔍 Checking configuration...");

try {
  const config = loadConfig();
  validateConfig(config);

  console.log("✅ Configuration is valid!");
  console.log("📊 Configuration details:");
  console.log(`   Repository: ${config.repository}`);
  console.log(`   Model: ${config.model}`);
  console.log(`   Provider: ${config.provider}`);
  console.log(`   Max Iterations: ${config.maxIterations}`);
} catch (error) {
  console.error(
    "❌ Configuration error:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
