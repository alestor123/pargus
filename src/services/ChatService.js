import Groq from "groq-sdk";

class ChatService {
    constructor() {
        this.apiKey = "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"; // Set this locally or via ENV
        this.groq = null;
        this.model = "llama-3.1-8b-instant"; // Fast, supported conversational model
        this.history = [
            { role: "system", content: "You are Navia, a friendly and empathetic voice assistant for the visually impaired. Keep responses concise (under 30 words). If the user asks to navigate to a place, start your response with 'NAVIGATE_TO: [Place Name] | ' followed by a confirmation. Example: 'NAVIGATE_TO: Starbucks | Okay, getting directions to Starbucks.'." }
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
        // Lazy init if missing (e.g., hot reload or delayed key)
        if (!this.groq && this.apiKey && this.apiKey !== "placeholder_key") {
            this.groq = new Groq({ apiKey: this.apiKey, dangerouslyAllowBrowser: true });
        }

        if (!this.groq) return { text: "Assistant is not configured. Please check API key." };

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

            const rawMessage = response.choices[0].message.content;

            // Parse for navigation command
            let text = rawMessage;
            let navTarget = null;

            if (rawMessage.includes('NAVIGATE_TO:')) {
                const parts = rawMessage.split('|');
                // Part 0: NAVIGATE_TO: Place
                // Part 1: Confirmation text
                const commandPart = parts[0];
                navTarget = commandPart.replace('NAVIGATE_TO:', '').trim();
                text = parts[1] ? parts[1].trim() : `Navigating to ${navTarget}`;
            }

            this.history.push({ role: "assistant", content: rawMessage }); // Log raw for context

            return { text, navTarget };
        } catch (error) {
            console.error("Chat Service Error:", error);
            return { text: "I'm having trouble connecting right now." };
        }
    }


    resetHistory() {
        this.history = [this.history[0]];
    }
}

export default new ChatService();
