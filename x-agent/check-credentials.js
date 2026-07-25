import "dotenv/config";

/**
 * Sanity-checks the shape of the X credentials without ever printing the
 * actual secret values - just enough metadata (length, whitespace,
 * expected format) to catch the most common copy-paste mistakes behind a
 * 401 Unauthorized from twitter-api-v2.
 */
const EXPECTED = {
  X_API_KEY: { label: "Consumer Key (API Key)", pattern: /^[A-Za-z0-9]{20,30}$/ },
  X_API_SECRET: { label: "Consumer Secret (API Key Secret)", pattern: /^[A-Za-z0-9]{40,60}$/ },
  X_ACCESS_TOKEN: { label: "Access Token", pattern: /^\d+-[A-Za-z0-9]{30,50}$/ },
  X_ACCESS_TOKEN_SECRET: { label: "Access Token Secret", pattern: /^[A-Za-z0-9]{40,60}$/ },
};

let allGood = true;

for (const [key, { label, pattern }] of Object.entries(EXPECTED)) {
  const raw = process.env[key];
  if (!raw) {
    console.log(`[MISSING]        ${key} (${label}) is not set in .env`);
    allGood = false;
    continue;
  }

  const trimmed = raw.trim();
  const issues = [];
  if (raw !== trimmed) issues.push("has leading/trailing whitespace");
  if (/[\r\n]/.test(raw)) issues.push("contains a newline character");
  if (/^['"]|['"]$/.test(raw)) issues.push("has stray quote characters");
  if (!pattern.test(trimmed)) issues.push(`doesn't match the expected shape for a ${label}`);

  if (issues.length > 0) {
    console.log(`[SUSPICIOUS]     ${key}: length ${raw.length} - ${issues.join(", ")}`);
    allGood = false;
  } else {
    console.log(`[OK]             ${key}: length ${trimmed.length}, shape looks right`);
  }
}

// Access Token format is "<numeric user id>-<rest>" - the numeric prefix
// should match the account that owns the App the Consumer Key belongs to.
// We can't verify that without calling the API, but we can at least flag
// an obviously malformed prefix.
const token = process.env.X_ACCESS_TOKEN;
if (token && !/^\d+-/.test(token.trim())) {
  console.log("[SUSPICIOUS]     X_ACCESS_TOKEN doesn't start with '<digits>-' - Access Tokens normally look like 1234567890123456789-AbCdEf...");
  allGood = false;
}

console.log("");
console.log(allGood ? "All four values look structurally correct. If you're still getting 401, it's most likely a mismatched App/Project pair rather than a formatting issue - see README.md." : "Fix the flagged value(s) above (regenerate in the X Developer Portal and re-paste), then re-run this check.");
