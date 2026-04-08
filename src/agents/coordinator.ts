import { query } from "@anthropic-ai/claude-agent-sdk";
import { frontendAgent } from "./frontend-agent";
import { backendAgent } from "./backend-agent";
import { databaseAgent } from "./database-agent";
import { reviewerAgent } from "./reviewer-agent";
import { marketingAgent } from "./marketing-agent";
import { seoAgent } from "./seo-agent";
import { uiuxAgent } from "./uiux-agent";

const agentTeam = {
  "frontend-expert": frontendAgent,
  "backend-expert": backendAgent,
  "database-expert": databaseAgent,
  "code-reviewer": reviewerAgent,
  "marketing-expert": marketingAgent,
  "seo-expert": seoAgent,
  "uiux-expert": uiuxAgent,
};

export async function runCoordinator(task: string) {
  const results: string[] = [];

  for await (const message of query({
    prompt: task,
    options: {
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent"],
      agents: agentTeam,
      systemPrompt: `You are the team coordinator for a Next.js gestionale (management app) project.
You have a team of specialist agents at your disposal:

- frontend-expert: React, Next.js, UI components, styling
- backend-expert: API routes, server actions, auth, middleware
- database-expert: Supabase, PostgreSQL, migrations, RLS
- code-reviewer: Code quality, security, performance review
- marketing-expert: Copywriting, email campaigns, landing pages, conversion optimization
- seo-expert: Meta tags, structured data, Core Web Vitals, search visibility
- uiux-expert: Accessibility, responsive design, user flows, design consistency

Your job is to:
1. Analyze the incoming task
2. Break it into subtasks for the appropriate specialists
3. Delegate to the right agent(s)
4. Combine their outputs into a coherent result

Rules:
- Delegate to specialists instead of doing everything yourself
- Run independent subtasks in parallel when possible
- Always have the code-reviewer agent review significant changes
- Communicate clearly what each agent should focus on`,
      model: "opus",
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block) {
          results.push(block.text);
        }
      }
    }
  }

  return results.join("\n");
}

// CLI entry point
const task = process.argv[2];
if (task) {
  runCoordinator(task)
    .then((result) => {
      console.log(result);
    })
    .catch(console.error);
}
