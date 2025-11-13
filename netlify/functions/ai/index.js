export async function handler(event) {
  const body = JSON.parse(event.body);

  const userInput = body.input;

  const res = await fetch("GOOGLE_AI_ENDPOINT_URL", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.GOOGLE_AI_KEY
    },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: userInput }] }
      ]
    })
  });

  const data = await res.json();

  return {
    statusCode: 200,
    body: JSON.stringify({
      output: data.candidates?.[0]?.content?.parts?.[0]?.text || "Yanıt yok"
    })
  };
}