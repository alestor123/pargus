import Groq from "groq-sdk";

class GroqService {
    constructor() {
        this.apiKey = "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";
        this.groq = null;
        this.model = "meta-llama/llama-4-scout-17b-16e-instruct"; // Latest supported vision model 2026

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
            const prompt = `Describe the most critical obstacle or path status in front of the visually impaired user in under 6 words. 
            Examples: "Clear path", "Car ahead", "Stairs going down", "Person blocking path". 
            Be direct and urgent.`;

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
