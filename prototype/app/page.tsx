
"use client";

import { useState } from "react";
import { mockApartments } from "../data/mockApartments";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [apartmentId, setApartmentId] = useState("apt-001");

  async function askGemini() {
    if (!question.trim() || loading) return;

    setLoading(true);
    setAnswer("");
    setIsDemo(false);

    try {
      const response = await fetch("/api/ai/advice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          apartmentId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setAnswer(data.answer);
      setIsDemo(data.demo === true);
    } catch (error) {
      setAnswer(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16 text-stone-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-4xl font-bold">
          Hearthstone Hub
        </h1>

        <p className="mb-8 text-stone-600">
          Your AI-powered NYC apartment advisor
        </p>

        <div className="mb-6">
          <label
            htmlFor="apartment"
            className="mb-2 block font-medium"
          >
            Select an apartment
          </label>

          <select
            id="apartment"
            value={apartmentId}
            onChange={(event) => {
              setApartmentId(event.target.value);
              setAnswer("");
            }}
            className="w-full rounded-xl border border-stone-300 bg-white p-4"
          >
            {mockApartments.map((apartment) => (
              <option
                key={apartment.id}
                value={apartment.id}
              >
                {apartment.address} — $
                {apartment.monthlyRent}/month
              </option>
            ))}
          </select>

          <p className="mt-2 text-sm text-stone-500">
            Fictional apartment data for demonstration only.
          </p>
        </div>

        <div className="mb-4">
          <label
            htmlFor="question"
            className="mb-2 block font-medium"
          >
            Ask about this apartment
          </label>

          <textarea
            id="question"
            className="w-full rounded-xl border border-stone-300 bg-white p-4"
            rows={4}
            placeholder="Is this apartment a good choice if I'm worried about pests?"
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
          />
        </div>

        <button
          onClick={askGemini}
          disabled={loading || !question.trim()}
          className="rounded-lg bg-stone-900 px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask Hearthstone"}
        </button>

        {answer && (
          <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-xl font-semibold">
              {isDemo ? "Demo Response" : "AI Advice"}
            </h2>

            {isDemo && (
              <p className="mb-4 text-sm text-amber-700">
                Gemini is temporarily unavailable.
                This is a sample response, not AI-generated advice.
              </p>
            )}

            <p className="whitespace-pre-wrap">
              {answer}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
