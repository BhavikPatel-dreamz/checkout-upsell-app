import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { ok: true as const };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const question = String(form.get("question") ?? "");
  const { queryCopilot } = await import("../ai/copilot/copilot.server");
  const result = await queryCopilot(session.shop, question);
  return { ok: true as const, question, ...result };
}

export default function CopilotPage() {
  useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Copilot">
      <s-section heading="Ask about shop aggregates">
        <s-paragraph>
          Copilot answers from incrementality rollups, Smart Moments, and
          campaign/offer counts. It never sends raw browse or purchase events,
          emails, or shopper ids to a model. Pick OpenAI, Grok, or Gemini in
          Settings (API keys are environment variables).
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Question
              <textarea
                name="question"
                rows={3}
                style={{ width: "100%" }}
                defaultValue={actionData?.question ?? "What is our incremental revenue vs holdout?"}
              />
            </label>
            <s-button type="submit" variant="primary">
              Ask
            </s-button>
          </s-stack>
        </Form>
      </s-section>
      {actionData?.ok ? (
        <s-section heading="Answer">
          <s-paragraph>{actionData.answer}</s-paragraph>
          <s-paragraph>
            Source:{" "}
            {actionData.source === "aggregates"
              ? "aggregates only (no model key, provider off, or the model call failed)"
              : `${actionData.source} over aggregates`}
          </s-paragraph>
        </s-section>
      ) : null}
    </s-page>
  );
}
