import { PageHeader } from "@/components/ui";
import Assistant from "@/components/Assistant";
import { assistantConfigured, MODEL } from "@/lib/assistant";

export const metadata = { title: "Assistant" };
export default function AssistantPage() {
  return (
    <>
      <PageHeader title="Ask the Command Center" sub={assistantConfigured() ? `Answers come from your database records through read-only tools, with links to each record. Model: ${MODEL}.` : "Not connected yet: add ANTHROPIC_API_KEY in your hosting environment to enable the assistant."} />
      <Assistant enabled={assistantConfigured()} />
    </>
  );
}
