import { ChatGroq } from '@langchain/groq';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

let chatModel = null;

function getModel() {
  if (!chatModel) {
    const key = process.env.GROQ_API_KEY;
    if (!key || key === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured. Get your free key at https://console.groq.com and add it to server/.env');
    }
    chatModel = new ChatGroq({
      apiKey: key,
      model: "openai/gpt-oss-120b", // Smartest model on Groq for structured output
      temperature: 0.7,
    });
  }
  return chatModel;
}

// Define the exact schema we want the LLM to output using Zod
const ScheduleSchema = z.object({
  schedule: z.array(z.object({
    start: z.string().describe("Start time (e.g., '09:00')"),
    end: z.string().describe("End time (e.g., '10:00')"),
    title: z.string().describe("Short title of the time block"),
    desc: z.string().describe("Specific actionable details of what exactly to do"),
    category: z.string().describe("Category, e.g., 'Technical', 'JobSearch', 'Personal', 'Review'"),
    emoji: z.string().describe("A single relevant emoji")
  })),
  insight: z.string().describe("One sentence explaining why this schedule maximizes growth today")
});

export async function generateSchedule({ dims, todayGoals, selectedDims, availableHours, startTime, blockedTime }) {
  const model = getModel();

  const focusDims = selectedDims && selectedDims.length > 0
    ? dims.filter(d => selectedDims.includes(d.id))
    : [...dims].sort((a, b) => a.score - b.score).slice(0, 5);

  const focusText = focusDims.map(d => `${d.name} (${d.score}/10)`).join(', ');
  const allScores = dims.map(d => `${d.name}:${d.score}`).join(', ');

  const prompt = `You are a productivity assistant for Kedar, a CS student in Pune job-hunting for a Full Stack SDE role.

His growth radar scores: ${allScores}
Today's goals: ${todayGoals || "Not specified — prioritise lowest-score dimensions"}
Focus areas chosen: ${focusText}
Available: ${availableHours || 8} hours starting ${startTime || "09:00"}
Blocked: ${blockedTime || "None"}

Rules:
- Blocks should be 1–3 hours each
- Be SPECIFIC in desc (e.g. "Solve 2 LeetCode mediums on binary trees" not just "DSA")
- Always include at least one job-application block
- Include a lunch/break slot if schedule spans midday
- Weight heavier blocks toward lowest-scored dimensions
- End with a short review/plan-tomorrow block`;

  // Use LangChain's withStructuredOutput to force the model into our Zod schema
  const structuredModel = model.withStructuredOutput(ScheduleSchema);
  
  // LangChain automatically parses the JSON and returns the JS object safely
  const result = await structuredModel.invoke(prompt);
  
  return result;
}
