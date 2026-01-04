import Groq from "groq-sdk";

class GroqService {
    constructor() {
        this.apiKey = "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";
        this.groq = null;
        this.model = "meta-llama/llama-4-scout-17b-16e-instruct"; // Latest multimodal model

        if (this.apiKey !== "YOUR_GROQ_API_KEY_HERE" && this.apiKey !== "") {
            this.groq = new Groq({ apiKey: this.apiKey });
        }
    }

    setApiKey(key) {
        this.apiKey = key;
        this.groq = new Groq({ apiKey: this.apiKey });
    }

    async analyzeImage(base64Image) {
        if (!this.groq) {
            return "Groq API key not configured.";
        }

        try {
            const prompt = `You are Navia, a safety intelligence layer for visually impaired navigation. 
Interpret camera detections, prioritize urgent obstacles, and generate clear, human-friendly voice alerts. 
RULES:
1. VOICE-FIRST: Object description MUST be natural (e.g., "Car on your right", "Person ahead").
2. CONCISE: Response MUST be under 6 words to allow quick reaction.
3. PRIORITIZE: Vehicles > Stairs > People > Static objects.
4. SAFETY OVERRIDES: Alert immediately for path blockage.
5. JSON FORMAT: {"object": "natural voice alert", "direction": "LEFT|RIGHT|CENTER", "distance": number, "priority": "URGENT|NORMAL"}.
6. ALERT RANGE: Only alert if obstacle is < 4m ahead.`;

            const response = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`,
                                },
                            },
                        ],
                    },
                ],
                model: this.model,
                response_format: { type: "json_object" }
            });

            return response.choices[0].message.content;
        } catch (error) {
            if (error.status === 429) {
                return "QUOTA_EXCEEDED";
            }
            console.error("Groq Service Error:", error);
            return "Error analyzing surroundings.";
        }
    }
}

export default new GroqService();
