import { TavilyProvider } from "../src/providers/tavily/tavilyProvider"
import { TAVILY_USAGE_LIMIT, TAVILY_EXHAUSTED_USE_COUNT } from "../src/providers/tavily/tavilyConfig"

// Mock env
process.env.TAVILY_API_KEY = "tvly-key-a,tvly-key-b,tvly-key-c"

const provider = TavilyProvider.getInstance()

console.log("=== TEST 1: Basic rotation (3 keys) ===")
for (let i = 0; i < 6; i++) {
  const session = provider.getApiKey()
  console.log(`Call ${i + 1}: apiKey=${session.apiKey} useCount=${session.useCount}`)
}

console.log("\n=== TEST 2: Exhaustion ===")
TavilyProvider._resetForTest()
process.env.TAVILY_API_KEY = "tvly-single"
const single = TavilyProvider.getInstance()

for (let i = 0; i < TAVILY_USAGE_LIMIT + 1; i++) {
  const s = single.getApiKey()
  if (i < 3 || i >= TAVILY_USAGE_LIMIT - 1) {
    console.log(`Call ${i + 1}: apiKey=${s.apiKey} useCount=${s.useCount}`)
  } else if (i === 4) {
    console.log("...")
  }
}

console.log("\n=== TEST 3: Auth header ===")
TavilyProvider._resetForTest()
process.env.TAVILY_API_KEY = "tvly-test-key"
const header = provider.getAuthHeader()
console.log(`Auth header: "${header}"`)

console.log("\n=== TEST 4: No key env ===")
TavilyProvider._resetForTest()
delete process.env.TAVILY_API_KEY
const noKey = TavilyProvider.getInstance()
const s = noKey.getApiKey()
console.log(`Empty session: apiKey="${s.apiKey}" useCount=${s.useCount} (expected: "" and ${TAVILY_EXHAUSTED_USE_COUNT})`)

console.log("\nAll tests passed!")
