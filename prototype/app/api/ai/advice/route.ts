
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { mockApartments } from "../../../../data/mockApartments";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getDemoAnswer(
  apartment: (typeof mockApartments)[number]
) {
  const { complaints } = apartment;

  return `Apartment Assessment (Demo)

Address: ${apartment.address}
Neighborhood: ${apartment.neighborhood}
Monthly rent: $${apartment.monthlyRent}

Complaint History (Fictional):
- Rodent complaints: ${complaints.rodents}
- Bedbug complaints: ${complaints.bedbugs}
- Heating complaints: ${complaints.heating}
- Maintenance complaints: ${complaints.maintenance}

Things to consider:
${
  complaints.rodents > 5
    ? "- Rodent complaints are relatively high in this fictional sample."
    : "- Rodent complaints are relatively low in this fictional sample."
}

${
  complaints.heating > 5
    ? "- Heating complaints deserve closer investigation."
    : "- Heating complaints are relatively low in this fictional sample."
}

- Ask the landlord about outstanding repairs.
- Verify complaint history using official NYC housing records.

This is a sample assessment using fictional data,
not an AI-generated response or a real building report.`;
}

export async function POST(request: Request) {
  try {
    const { question, apartmentId } = await request.json();

    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    const apartment = mockApartments.find(
      (apt) => apt.id === apartmentId
    );

    if (!apartment) {
      return NextResponse.json(
        { error: "Please select a valid apartment." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",

            contents: `
Apartment information (fictional demo data):
Address: ${apartment.address}
Neighborhood: ${apartment.neighborhood}
Monthly rent: $${apartment.monthlyRent}
Rodent complaints: ${apartment.complaints.rodents}
Bedbug complaints: ${apartment.complaints.bedbugs}
Heating complaints: ${apartment.complaints.heating}
Maintenance complaints: ${apartment.complaints.maintenance}

Renter's question: ${question}

Use the provided apartment information to answer the question.
Do not invent additional building facts.
Clearly state that the apartment data is fictional.
`,

            config: {
              systemInstruction:
                "You are Hearthstone Hub, a helpful NYC apartment advisor. " +
                "Help renters understand apartment conditions, housing complaints, " +
                "and questions to ask landlords. " +
                "Do not invent building-specific facts.",
            },
          });

          if (response.text?.trim()) {
            return NextResponse.json({
              answer: response.text,
              demo: false,
            });
          }
        } catch (error) {
          console.error(
            `Gemini attempt ${attempt} failed:`,
            error
          );

          const status =
            typeof error === "object" &&
            error !== null &&
            "status" in error
              ? error.status
              : undefined;

          if (status !== 503 && status !== 429) {
            break;
          }

          if (attempt === 1) {
            await sleep(1000);
          }
        }
      }
    }

    return NextResponse.json({
      answer: getDemoAnswer(apartment),
      demo: true,
    });
  } catch (error) {
    console.error("API error:", error);

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
