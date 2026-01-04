import Groq from "groq-sdk";

class ChatService {
    constructor() {
        this.apiKey = "placeholder_key"; // Set this locally or via ENV
        this.groq = null;
        this.model = "llama3-8b-8192"; // Fast, conversational model
        this.history = [
            { role: "system", content: "You are Navia, a friendly and empathetic voice assistant for the visually impaired. Keep responses concise (under 30 words), helpful, and conversational. Use a natural tone as if chatting with a friend. If asked about surroundings, acknowledge you are also monitoring for safety." }
        ];

        if (this.apiKey && this.apiKey !== "placeholder_key") {
            this.groq = new Groq({ apiKey: this.apiKey, dangerouslyAllowBrowser: true });
        }
    }

    setApiKey(key) {
        this.apiKey = key;
        this.groq = new Groq({ apiKey: this.apiKey, dangerouslyAllowBrowser: true });
    }

    async getChatResponse(userMessage, locationContext = null) {
        if (!this.groq) return "Assistant is not configured. Please check API key.";

        try {
            // Add user message to history
            const content = locationContext
                ? `(User is at ${locationContext.latitude}, ${locationContext.longitude}) ${userMessage}`
                : userMessage;

            this.history.push({ role: "user", content });

            // Keep history manageable
            if (this.history.length > 10) this.history.splice(1, 2);

            const response = await this.groq.chat.completions.create({
                messages: this.history,
                model: this.model,
                temperature: 0.7,
                max_tokens: 150,
            });

            const assistantMessage = response.choices[0].message.content;
            this.history.push({ role: "assistant", content: assistantMessage });

            return assistantMessage;
        } catch (error) {
            console.error("Chat Service Error:", error);
            return "I'm having trouble connecting right now.";
        }
    }

    resetHistory() {
        this.history = [this.history[0]];
    }
}

export default new ChatService();
